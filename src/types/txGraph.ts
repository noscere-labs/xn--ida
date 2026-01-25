/**
 * TX Graph Type Definitions
 *
 * Data structures for recursive transaction graph visualization
 */

export interface TxOutput {
  vout: number;           // Output index
  value: number;          // Value in satoshis
  isSpent: boolean;       // Whether this output has been spent
  spentBy?: string;       // TXID of the spending transaction (if spent)
  address?: string;       // Destination address (optional)
}

export interface TxGraphNode {
  txid: string;                    // Transaction ID
  level: number;                   // Distance from root (0 = starting tx)
  type: 'root' | 'intermediate' | 'utxo' | 'fee-consumed';
  position: { x: number; y: number };
  outputs: TxOutput[];             // All outputs from this transaction
  totalValue: number;              // Sum of all output values in satoshis
  visited: boolean;                // Traversal tracking flag
  timestamp?: number;              // When this node was fetched
  confirmations?: number;          // Number of confirmations
}

export interface GraphEdge {
  from: string;                    // Parent transaction ID
  to: string;                      // Child transaction ID or UTXO identifier
  vout: number;                    // Output index being spent
  value: number;                   // Value flowing through this edge (satoshis)
  type: 'spending' | 'utxo' | 'fee';
}

export interface GraphStats {
  totalNodes: number;              // Total transactions discovered
  totalUTXOs: number;              // Terminal unspent outputs found
  totalFeeConsumed: number;        // Total satoshis consumed by fees
  maxDepth: number;                // Maximum distance from root
  totalValue: number;              // Total value flowing through graph
  elapsedTime: number;             // Seconds since traversal started
  apiCallsCount: number;           // Number of API calls made
  queueSize: number;               // Current queue size
  errors: number;                  // Number of errors encountered
}

export interface GraphData {
  nodes: Map<string, TxGraphNode>;
  edges: GraphEdge[];
  rootTxid: string;
  stats: GraphStats;
}

export interface TraversalQueueItem {
  txid: string;                    // Transaction containing the output
  parentTxid: string;              // Parent transaction for graph building
  vout: number;                    // Which output index to check
  level: number;                   // Depth level in the graph
  value: number;                   // Value of this output
}

export type TraversalStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'error';

export interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  levelHeight: number;             // Vertical spacing between levels
  minNodeSpacing: number;          // Minimum horizontal spacing between nodes
  paddingX: number;                // Horizontal padding
  paddingY: number;                // Vertical padding
}
