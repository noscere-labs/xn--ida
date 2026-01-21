/**
 * Graph Traversal Service
 *
 * Handles recursive BFS traversal of Bitcoin transaction graphs,
 * following spent outputs until reaching UTXOs or fee-consumed endpoints.
 */

import { whatsOnChainService, TransactionInfo } from './whatsonchain';
import {
  GraphData,
  GraphStats,
  TxGraphNode,
  GraphEdge,
  TraversalQueueItem,
  TxOutput,
  TraversalStatus,
} from '../types/txGraph';

export class GraphTraversal {
  private queue: TraversalQueueItem[] = [];
  private graphData: GraphData;
  private status: TraversalStatus = 'idle';
  private startTime: number = 0;
  private onUpdate: (data: GraphData, status: TraversalStatus) => void;
  private processedOutputs: Set<string> = new Set(); // Track txid:vout to avoid duplicates
  private txCache: Map<string, TransactionInfo> = new Map(); // Cache fetched transactions
  private minValueBSV: number; // Minimum value in BSV to follow (0 = follow all)
  private maxDepth: number; // Maximum depth to traverse (0 = unlimited)

  constructor(
    onUpdate: (data: GraphData, status: TraversalStatus) => void,
    minValueBSV: number = 0,
    maxDepth: number = 4
  ) {
    this.onUpdate = onUpdate;
    this.minValueBSV = minValueBSV;
    this.maxDepth = maxDepth;
    this.graphData = this.createEmptyGraphData();
  }

  private createEmptyGraphData(): GraphData {
    return {
      nodes: new Map(),
      edges: [],
      rootTxid: '',
      stats: {
        totalNodes: 0,
        totalUTXOs: 0,
        totalFeeConsumed: 0,
        maxDepth: 0,
        totalValue: 0,
        elapsedTime: 0,
        apiCallsCount: 0,
        queueSize: 0,
        errors: 0,
      },
    };
  }

  public async startTraversal(startTxid: string): Promise<void> {
    // Reset state
    this.queue = [];
    this.graphData = this.createEmptyGraphData();
    this.graphData.rootTxid = startTxid;
    this.processedOutputs.clear();
    this.txCache.clear();
    this.startTime = Date.now();
    this.status = 'running';

    try {
      // Fetch the starting transaction (and cache it)
      const rootTx = await this.getTransactionCached(startTxid);

      // Create root node
      const rootNode = this.createNode(rootTx, 0, 'root');
      this.graphData.nodes.set(startTxid, rootNode);
      this.graphData.stats.totalNodes++;

      // Enqueue all outputs for processing (filter by minimum value threshold)
      for (const output of rootTx.vout) {
        // Skip outputs below the minimum value threshold
        if (this.minValueBSV > 0 && output.value < this.minValueBSV) {
          continue;
        }
        this.enqueue({
          txid: startTxid,
          parentTxid: startTxid,
          vout: output.n,
          level: 0,
          value: output.value,
        });
      }

      // Trigger initial update
      this.updateStats();
      this.onUpdate(this.graphData, this.status);

      // Process the queue
      await this.processQueue();

      // Mark as completed
      this.status = 'completed';
      this.updateStats();
      this.onUpdate(this.graphData, this.status);
    } catch (error) {
      console.error('Error starting traversal:', error);
      this.status = 'error';
      this.graphData.stats.errors++;
      this.onUpdate(this.graphData, this.status);
      throw error;
    }
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.status === 'running') {
      const item = this.dequeue();
      if (!item) break;

      // Check status again before processing
      if (this.status !== 'running') {
        break;
      }

      // Skip if already processed
      const outputKey = `${item.txid}:${item.vout}`;
      if (this.processedOutputs.has(outputKey)) {
        continue;
      }
      this.processedOutputs.add(outputKey);

      try {
        await this.processOutput(item);

        // Update graph after EVERY node for progressive visualization
        this.updateStats();
        this.onUpdate(this.graphData, this.status);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error processing ${item.txid}:${item.vout}:`, errorMessage);
        console.error(`   Level: ${item.level}, Parent: ${item.parentTxid}`);
        console.error(`   Full error:`, error);
        this.graphData.stats.errors++;
        // Continue with next item despite error
      }
    }
  }

  private async processOutput(item: TraversalQueueItem): Promise<void> {
    // Check if we should stop
    if (this.status !== 'running') {
      return;
    }

    // Check if output is spent (retries handled by WhatsOnChainService)
    const spentInfo = await whatsOnChainService.getSpentStatus(item.txid, item.vout);
    this.graphData.stats.apiCallsCount++;

    // Check again after async operation
    if (this.status !== 'running') {
      return;
    }

    const parentNode = this.graphData.nodes.get(item.parentTxid);
    if (!parentNode) {
      console.warn(`Parent node not found: ${item.parentTxid}`);
      return;
    }

    // Update parent node's output info
    const output = parentNode.outputs.find(o => o.vout === item.vout);
    if (output) {
      output.isSpent = spentInfo !== null;
      if (spentInfo) {
        output.spentBy = spentInfo.txid;
      }
    }

    if (!spentInfo) {
      // UTXO found - terminus condition
      this.handleUTXO(item, parentNode);
      return;
    }

    // Check status before continuing
    if (this.status !== 'running') {
      return;
    }

    // Output is spent - fetch spending transaction (with caching)
    const spendingTx = await this.getTransactionCached(spentInfo.txid);

    // Check again after async operation
    if (this.status !== 'running') {
      return;
    }

    // Calculate total output value (fast - no API calls needed)
    const totalOutputValue = spendingTx.vout.reduce((sum, out) => sum + out.value, 0);

    // Quick check: if outputs are zero or very small, it's likely fee-consumed
    // Skip expensive input value calculation for most cases
    if (totalOutputValue === 0) {
      // Definitely fee consumed - all value went to fees
      this.handleFeeConsumed(item, spendingTx, item.value);
      return;
    }

    // For non-zero outputs, continue traversal without calculating exact fees
    // This avoids the expensive input value calculation that was causing stalls
    // Fee calculation can be done as a background task later if needed

    // Continue traversal - add spending tx to graph
    if (!this.graphData.nodes.has(spendingTx.txid)) {
      const childNode = this.createNode(spendingTx, item.level + 1, 'intermediate');
      this.graphData.nodes.set(spendingTx.txid, childNode);
      this.graphData.stats.totalNodes++;

      // Update max depth
      if (item.level + 1 > this.graphData.stats.maxDepth) {
        this.graphData.stats.maxDepth = item.level + 1;
      }
    }

    // Add edge
    this.graphData.edges.push({
      from: item.parentTxid,
      to: spendingTx.txid,
      vout: item.vout,
      value: item.value,
      type: 'spending',
    });

    // Check if we've reached max depth (0 = unlimited)
    if (this.maxDepth > 0 && item.level + 1 >= this.maxDepth) {
      // Don't enqueue further - we've reached the depth limit
      return;
    }

    // Enqueue all outputs of spending transaction (filter by minimum value threshold)
    for (const output of spendingTx.vout) {
      // Skip outputs below the minimum value threshold
      if (this.minValueBSV > 0 && output.value < this.minValueBSV) {
        continue;
      }
      this.enqueue({
        txid: spendingTx.txid,
        parentTxid: spendingTx.txid,
        vout: output.n,
        level: item.level + 1,
        value: output.value,
      });
    }
  }

  private handleUTXO(item: TraversalQueueItem, parent: TxGraphNode): void {
    const utxoId = `${item.txid}:${item.vout}`;

    // Create UTXO node
    const utxoNode: TxGraphNode = {
      txid: utxoId,
      level: item.level + 1,
      type: 'utxo',
      position: { x: 0, y: 0 },
      outputs: [],
      totalValue: item.value,
      visited: true,
      timestamp: Date.now(),
    };

    this.graphData.nodes.set(utxoId, utxoNode);
    this.graphData.stats.totalNodes++;
    this.graphData.stats.totalUTXOs++;

    // Update max depth
    if (item.level + 1 > this.graphData.stats.maxDepth) {
      this.graphData.stats.maxDepth = item.level + 1;
    }

    // Add edge
    this.graphData.edges.push({
      from: item.parentTxid,
      to: utxoId,
      vout: item.vout,
      value: item.value,
      type: 'utxo',
    });
  }

  private handleFeeConsumed(item: TraversalQueueItem, tx: TransactionInfo, fee: number): void {
    const feeId = `${tx.txid}:fee`;

    // Create fee-consumed node
    const feeNode: TxGraphNode = {
      txid: feeId,
      level: item.level + 1,
      type: 'fee-consumed',
      position: { x: 0, y: 0 },
      outputs: [],
      totalValue: fee,
      visited: true,
      timestamp: Date.now(),
    };

    this.graphData.nodes.set(feeId, feeNode);
    this.graphData.stats.totalNodes++;
    this.graphData.stats.totalFeeConsumed += fee;

    // Update max depth
    if (item.level + 1 > this.graphData.stats.maxDepth) {
      this.graphData.stats.maxDepth = item.level + 1;
    }

    // Add edge
    this.graphData.edges.push({
      from: item.parentTxid,
      to: feeId,
      vout: item.vout,
      value: fee,
      type: 'fee',
    });
  }

  private async getTransactionCached(txid: string): Promise<TransactionInfo> {
    // Check cache first
    if (this.txCache.has(txid)) {
      return this.txCache.get(txid)!;
    }

    // Fetch and cache (rate limiting and retries handled by WhatsOnChainService)
    const tx = await whatsOnChainService.getTransaction(txid);
    this.graphData.stats.apiCallsCount++;
    this.txCache.set(txid, tx);
    return tx;
  }

  private async calculateInputValue(tx: TransactionInfo): Promise<number> {
    let totalValue = 0;

    // Process inputs sequentially to respect rate limiting
    for (const input of tx.vin) {
      // Check if we should stop
      if (this.status !== 'running') {
        break;
      }

      // Skip coinbase inputs (they don't have a txid)
      if (!input.txid) {
        continue;
      }

      try {
        // Fetch the input transaction to get the output value (with caching)
        const inputTx = await this.getTransactionCached(input.txid);

        // Check again after async operation
        if (this.status !== 'running') {
          break;
        }

        const output = inputTx.vout[input.vout];
        if (output) {
          totalValue += output.value;
        }
      } catch (error) {
        console.error(`Error fetching input tx ${input.txid}:`, error);
        this.graphData.stats.errors++;
      }
    }

    return totalValue;
  }

  private createNode(tx: TransactionInfo, level: number, type: TxGraphNode['type']): TxGraphNode {
    const outputs: TxOutput[] = tx.vout.map(vout => ({
      vout: vout.n,
      value: vout.value,
      isSpent: false,
      address: vout.scriptPubKey?.addresses?.[0],
    }));

    const totalValue = outputs.reduce((sum, out) => sum + out.value, 0);

    return {
      txid: tx.txid,
      level,
      type,
      position: { x: 0, y: 0 },
      outputs,
      totalValue,
      visited: false,
      timestamp: Date.now(),
      confirmations: tx.confirmations,
    };
  }

  private enqueue(item: TraversalQueueItem): void {
    this.queue.push(item);
  }

  private dequeue(): TraversalQueueItem | null {
    return this.queue.shift() || null;
  }

  private updateStats(): void {
    this.graphData.stats.elapsedTime = (Date.now() - this.startTime) / 1000;
    this.graphData.stats.queueSize = this.queue.length;
  }

  public pause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
      this.updateStats();
      this.onUpdate(this.graphData, this.status);
    }
  }

  public resume(): void {
    if (this.status === 'paused') {
      this.status = 'running';
      this.processQueue();
    }
  }

  public stop(): void {
    this.status = 'stopped';
    // Clear the queue to prevent any pending operations
    this.queue = [];
    this.updateStats();
    this.onUpdate(this.graphData, this.status);
    console.log('Traversal stopped. Queue cleared.');
  }

  public getStatus(): TraversalStatus {
    return this.status;
  }

  public getGraphData(): GraphData {
    return this.graphData;
  }
}
