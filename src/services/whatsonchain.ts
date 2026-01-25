import { Hash } from '@bsv/sdk';

export type Network = 'main' | 'test';

export interface BlockInfo {
  hash: string;
  height: number;
  version: number;
  merkleroot: string;
  time: number;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  chainwork: string;
  previousblockhash?: string;
  nextblockhash?: string;
  size: number;
  weight: number;
  tx: string[];
}

export interface BlockHeader {
  hash: string;
  version: number;
  prevHash: string;
  merkleRoot: string;
  time: number;
  bits: string;
  nonce: number;
}

export interface MerkleProof {
  index: number;
  txOrId: string;
  target: string;
  nodes: string[];
}

export interface TransactionInfo {
  txid: string;
  hash: string;
  version: number;
  size: number;
  locktime: number;
  vin: Array<{
    txid: string;
    vout: number;
    scriptSig: {
      asm: string;
      hex: string;
    };
    sequence: number;
  }>;
  vout: Array<{
    value: number;
    n: number;
    scriptPubKey: {
      asm: string;
      hex: string;
      type: string;
      addresses?: string[];
    };
  }>;
  blockheight?: number;
  confirmations?: number;
  time?: number;
  blocktime?: number;
}

export interface SpentInfo {
  txid: string;
  vin: number;
}

export interface BulkTransactionRequest {
  txids: string[];
}

export interface BulkSpentRequest {
  utxos: Array<{
    txid: string;
    vout: number;
  }>;
}

// Global request queue for rate limiting with exponential backoff
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly MIN_DELAY = 500; // Increased to 0.5 seconds for safety margin
  private consecutiveRateLimitErrors = 0;
  private currentBackoffDelay = 0;

  async enqueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          // Reset backoff on success
          this.consecutiveRateLimitErrors = 0;
          this.currentBackoffDelay = 0;
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      // Calculate total delay including backoff
      const totalDelay = this.MIN_DELAY + this.currentBackoffDelay;

      // Wait if we need to respect rate limit
      if (timeSinceLastRequest < totalDelay) {
        const waitTime = totalDelay - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const request = this.queue.shift();
      if (request) {
        this.lastRequestTime = Date.now();
        try {
          await request();
        } catch (error) {
          // Check if it's a rate limit error
          if (error instanceof Error && error.message.includes('429')) {
            this.consecutiveRateLimitErrors++;
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max)
            this.currentBackoffDelay = Math.min(
              Math.pow(2, this.consecutiveRateLimitErrors - 1) * 1000,
              16000
            );
            console.warn(`Rate limit hit. Applying ${this.currentBackoffDelay}ms backoff delay.`);
          }
          // Error already handled by request promise, just continue
        }
      }
    }

    this.processing = false;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getCurrentBackoff(): number {
    return this.currentBackoffDelay;
  }
}

// Global singleton queue
const globalRequestQueue = new RequestQueue();

export class WhatsOnChainService {
  private network: Network;

  constructor(network: Network = 'main') {
    this.network = network;
  }

  public setNetwork(network: Network): void {
    this.network = network;
  }

  public getNetwork(): Network {
    return this.network;
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    return globalRequestQueue.enqueue(async () => {
      const response = await fetch('/api/whatsonchain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint,
          network: this.network,
          method: 'GET'
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`WhatsOnChain API error: ${result.status || response.status} ${result.statusText || response.statusText}`);
      }

      return result.data;
    });
  }

  private async makePostRequest<T>(endpoint: string, data: unknown): Promise<T> {
    return globalRequestQueue.enqueue(async () => {
      const response = await fetch('/api/whatsonchain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint,
          network: this.network,
          method: 'POST',
          data
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`WhatsOnChain API error: ${result.status || response.status} ${result.statusText || response.statusText}`);
      }

      return result.data;
    });
  }

  public async getBlockByHeight(height: number): Promise<BlockInfo> {
    return this.makeRequest<BlockInfo>(`/block/height/${height}`);
  }

  public async getBlockByHash(hash: string): Promise<BlockInfo> {
    return this.makeRequest<BlockInfo>(`/block/hash/${hash}`);
  }

  public async getBlockHeader(hashOrHeight: string | number): Promise<BlockHeader> {
    const identifier = typeof hashOrHeight === 'number' ? `height/${hashOrHeight}` : hashOrHeight;
    return this.makeRequest<BlockHeader>(`/block/${identifier}/header`);
  }

  public async getTransaction(txid: string): Promise<TransactionInfo> {
    return this.makeRequest<TransactionInfo>(`/tx/hash/${txid}`);
  }

  public async getMerkleProof(txid: string): Promise<MerkleProof> {
    return this.makeRequest<MerkleProof>(`/tx/${txid}/proof/tsc`);
  }

  public async getBulkTransactions(txids: string[]): Promise<TransactionInfo[]> {
    const request: BulkTransactionRequest = { txids };
    return this.makePostRequest<TransactionInfo[]>('/txs', request);
  }

  public async getSpentStatus(txid: string, vout: number): Promise<SpentInfo | null> {
    const maxRetries = 3; // Reduced retries since queue handles backoff
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequest<SpentInfo>(`/tx/${txid}/${vout}/spent`);
      } catch (error) {
        if (error instanceof Error) {
          // 404 typically means unspent
          if (error.message.includes('404')) {
            if (attempt < 1) {
              // Only retry once for 404s
              await new Promise(resolve => setTimeout(resolve, 500));
              lastError = error;
              continue;
            } else {
              // Assume it's genuinely unspent
              return null;
            }
          }

          // For 400 errors, don't retry - likely invalid
          if (error.message.includes('400')) {
            console.warn(`Invalid request for ${txid}:${vout}:`, error.message);
            return null;
          }

          // For 429 errors, let queue handle backoff - only retry a few times
          if (error.message.includes('429')) {
            if (attempt < maxRetries) {
              // Queue will apply exponential backoff automatically
              lastError = error;
              continue;
            } else {
              console.warn(`Rate limit persists for ${txid}:${vout} after ${maxRetries} retries`);
              throw error;
            }
          }

          // For other errors, retry with minimal backoff
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            lastError = error;
            continue;
          }
        }
        throw error;
      }
    }

    // If we exhausted all retries
    throw lastError || new Error(`Failed to check spent status for ${txid}:${vout} after ${maxRetries} retries`);
  }

  public async getBulkSpentStatus(utxos: Array<{ txid: string; vout: number }>): Promise<Array<SpentInfo | null>> {
    try {
      const request: BulkSpentRequest = { utxos };
      const response = await this.makePostRequest<Array<SpentInfo | null>>('/utxos/spent', request);
      return response;
    } catch {
      // If bulk request fails, fall back to individual requests
      const results: Array<SpentInfo | null> = [];
      for (const utxo of utxos) {
        try {
          const spentInfo = await this.getSpentStatus(utxo.txid, utxo.vout);
          results.push(spentInfo);
        } catch {
          results.push(null);
        }
      }
      return results;
    }
  }

  public async getInputTransactions(txid: string): Promise<TransactionInfo[]> {
    const transaction = await this.getTransaction(txid);
    const inputTxids = transaction.vin.map(input => input.txid);
    
    if (inputTxids.length === 0) {
      return [];
    }
    
    // Remove duplicates
    const uniqueTxids = Array.from(new Set(inputTxids));
    
    return this.getBulkTransactions(uniqueTxids);
  }

  public async validateMerklePath(
    txid: string,
    merkleRoot: string,
    merklePath: Array<{
      offset: number;
      hash?: string;
      isDuplicate: boolean;
      isClientTxid: boolean;
    }[]>
  ): Promise<{ isValid: boolean; calculatedRoot?: string; error?: string }> {
    try {
      // Start with the transaction ID (reverse byte order for merkle calculation)
      let currentHash = this.reverseHex(txid);
      let currentIndex = 0;
      
      // Find the transaction index by looking for the client txid in the first level
      if (merklePath.length > 0) {
        const firstLevel = merklePath[0];
        const clientTxNode = firstLevel.find(node => node.isClientTxid);
        if (clientTxNode) {
          currentIndex = clientTxNode.offset;
        }
      }
      
      // Calculate merkle root from the provided path
      for (let level = 0; level < merklePath.length; level++) {
        const levelNodes = merklePath[level];
        
        if (levelNodes.length === 0) continue;
        
        // Find the appropriate sibling hash for this level
        const siblingOffset = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
        const siblingNode = levelNodes.find(node => node.offset === siblingOffset);
        
        if (!siblingNode?.hash) {
          // If no sibling found, this might be a duplicate or end of tree
          if (levelNodes.length === 1 && levelNodes[0].isDuplicate) {
            // Duplicate the current hash
            currentHash = this.sha256d(currentHash + currentHash);
          } else {
            // Check if this is the last level and we have an odd number of transactions
            // In Bitcoin, if there's an odd number at any level, the last hash is duplicated
            currentHash = this.sha256d(currentHash + currentHash);
          }
        } else {
          // Combine with sibling (both hashes should be in reverse byte order)
          const siblingHash = this.reverseHex(siblingNode.hash);
          if (currentIndex % 2 === 0) {
            // Current hash is left, sibling is right
            currentHash = this.sha256d(currentHash + siblingHash);
          } else {
            // Current hash is right, sibling is left
            currentHash = this.sha256d(siblingHash + currentHash);
          }
        }
        
        // Move to next level
        currentIndex = Math.floor(currentIndex / 2);
      }
      
      // Convert back to normal byte order for comparison
      const calculatedRoot = this.reverseHex(currentHash);
      const isValid = calculatedRoot.toLowerCase() === merkleRoot.toLowerCase();
      
      return {
        isValid,
        calculatedRoot,
        error: isValid ? undefined : `Calculated root ${calculatedRoot} does not match expected ${merkleRoot}`
      };
      
    } catch (error) {
      return {
        isValid: false,
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private reverseHex(hex: string): string {
    // Reverse the byte order of a hex string
    return hex.match(/.{2}/g)?.reverse().join('') || hex;
  }

  private sha256d(hex: string): string {
    // Double SHA256 using BSV SDK
    const buffer = Buffer.from(hex, 'hex');
    const hash1 = Hash.sha256(Array.from(buffer));
    const hash2 = Hash.sha256(hash1);
    return Buffer.from(hash2).toString('hex');
  }

  public async validateBumpData(
    blockHeight: number,
    txids: string[]
  ): Promise<{
    isValid: boolean;
    blockHash?: string;
    merkleRoot?: string;
    validTransactions: string[];
    invalidTransactions: string[];
    error?: string;
  }> {
    try {
      // Get block information
      const block = await this.getBlockByHeight(blockHeight);
      
      // Check which transactions are in the block
      const validTransactions: string[] = [];
      const invalidTransactions: string[] = [];
      
      for (const txid of txids) {
        if (block.tx.includes(txid)) {
          validTransactions.push(txid);
        } else {
          invalidTransactions.push(txid);
        }
      }
      
      const isValid = invalidTransactions.length === 0;
      
      return {
        isValid,
        blockHash: block.hash,
        merkleRoot: block.merkleroot,
        validTransactions,
        invalidTransactions,
        error: isValid ? undefined : `${invalidTransactions.length} transaction(s) not found in block ${blockHeight}`
      };
      
    } catch (error) {
      return {
        isValid: false,
        validTransactions: [],
        invalidTransactions: txids,
        error: `Block validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export a default instance
export const whatsOnChainService = new WhatsOnChainService();