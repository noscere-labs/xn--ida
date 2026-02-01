"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Network, whatsOnChainService } from "../services/whatsonchain";
import { GraphTraversal } from "../services/graphTraversal";
import { graphLayout } from "../services/graphLayout";
import { GraphData, TraversalStatus, TxGraphNode, GraphEdge } from "../types/txGraph";

interface TxGraphProps {
  network: Network;
}

const SAMPLE_TXS = {
  main: [
    'c1d32f28baa27a376ba977f6a8de6ce0a87041157cef0274b20bfda2b0d8df96',
    '4bdbdb7483c1c7ef48cda78ee4141af7cf15f94e10324e0bcac43c29394ea4a9',
  ],
  test: [
    '294cd1ebd5689fdee03509f92c32184c0f52f037d4046af250229b97e0c8f1aa',
  ],
};

export default function TxGraph({ network }: TxGraphProps) {
  const [txid, setTxid] = useState("");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [status, setStatus] = useState<TraversalStatus>("idle");
  const [svgDimensions, setSvgDimensions] = useState({ width: 1200, height: 800 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [minValueBSV, setMinValueBSV] = useState<string>("0");
  const [maxDepth, setMaxDepth] = useState<string>("4");
  const [showStats, setShowStats] = useState(false);
  const traversalRef = useRef<GraphTraversal | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const pendingUpdateRef = useRef<{ data: GraphData; status: TraversalStatus } | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize from URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlTxid = params.get('txid');
      const autoStart = params.get('autostart') === 'true';

      if (urlTxid) {
        setTxid(urlTxid);
        // Auto-start traversal if autostart parameter is present
        if (autoStart && status === 'idle') {
          // Wait for next tick to ensure state is updated
          setTimeout(() => {
            handleStartFromUrl(urlTxid);
          }, 100);
        }
      }
    }
  }, []); // Only run on mount

  // Sync network with WhatsOnChain service
  useEffect(() => {
    whatsOnChainService.setNetwork(network);
  }, [network]);

  // Reset when network changes
  useEffect(() => {
    if (status === 'running' || status === 'paused') {
      handleStop();
    }
  }, [network]);

  const handleUpdate = useCallback((data: GraphData, newStatus: TraversalStatus) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

    // Clone data IMMEDIATELY to capture current state before any throttling logic
    // This prevents stale data when the traversal continues mutating the original
    const clonedData: GraphData = {
      ...data,
      nodes: new Map(data.nodes),
      edges: [...data.edges],
      stats: { ...data.stats },
    };

    // Throttle updates to max 10 per second (100ms between updates)
    // But always update on completion or error states
    const shouldUpdateImmediately =
      newStatus === 'completed' ||
      newStatus === 'error' ||
      newStatus === 'stopped' ||
      timeSinceLastUpdate >= 100;

    if (shouldUpdateImmediately) {
      // Clear any pending timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }

      // Recalculate layout (mutates nodes in place)
      const dimensions = graphLayout.calculateLayout(clonedData);

      setGraphData(clonedData);
      setStatus(newStatus);
      setSvgDimensions(dimensions);
      lastUpdateTimeRef.current = now;
      pendingUpdateRef.current = null;
    } else {
      // Store the CLONED data (not the original reference) for later
      pendingUpdateRef.current = { data: clonedData, status: newStatus };

      // Schedule update if not already scheduled
      if (!updateTimeoutRef.current) {
        const delay = 100 - timeSinceLastUpdate;
        updateTimeoutRef.current = setTimeout(() => {
          updateTimeoutRef.current = null;
          if (pendingUpdateRef.current) {
            // Use the already-cloned data directly, don't clone again
            const dimensions = graphLayout.calculateLayout(pendingUpdateRef.current.data);
            setGraphData(pendingUpdateRef.current.data);
            setStatus(pendingUpdateRef.current.status);
            setSvgDimensions(dimensions);
            lastUpdateTimeRef.current = Date.now();
            pendingUpdateRef.current = null;
          }
        }, delay);
      }
    }
  }, []);

  // Update URL when starting traversal
  const updateUrl = (txidValue: string) => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('txid', txidValue);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  };

  // Get minimum value threshold in BSV (API returns values in BSV)
  const getMinValueBSV = (): number => {
    return parseFloat(minValueBSV) || 0;
  };

  // Get max depth (0 = unlimited)
  const getMaxDepth = (): number => {
    const depth = parseInt(maxDepth, 10);
    return isNaN(depth) ? 4 : depth;
  };

  const handleStartFromUrl = async (txidValue: string) => {
    if (!txidValue.trim()) return;

    // Create new traversal instance with minimum value threshold and max depth
    const minSats = getMinValueBSV();
    const depth = getMaxDepth();
    traversalRef.current = new GraphTraversal(handleUpdate, minSats, depth);

    try {
      await traversalRef.current.startTraversal(txidValue.trim());
    } catch (error) {
      console.error("Traversal error:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleStart = async () => {
    if (!txid.trim()) {
      alert("Please enter a transaction ID");
      return;
    }

    // Update URL with the txid
    updateUrl(txid.trim());

    // Create new traversal instance with minimum value threshold and max depth
    const minSats = getMinValueBSV();
    const depth = getMaxDepth();
    traversalRef.current = new GraphTraversal(handleUpdate, minSats, depth);

    try {
      await traversalRef.current.startTraversal(txid.trim());
    } catch (error) {
      console.error("Traversal error:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handlePause = () => {
    traversalRef.current?.pause();
  };

  const handleResume = () => {
    traversalRef.current?.resume();
  };

  const handleStop = () => {
    traversalRef.current?.stop();
  };

  const handleSampleTx = (sampleTxid: string) => {
    setTxid(sampleTxid);
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const formatSatoshis = (sats: number): string => {
    return sats.toLocaleString();
  };

  const formatBSV = (bsv: number): string => {
    // Values from WhatsOnChain API are already in BSV (not satoshis)
    // Show up to 4 decimal places for most values
    if (bsv >= 1) return `${bsv.toFixed(4)} BSV`;
    if (bsv >= 0.0001) return `${bsv.toFixed(4)} BSV`;
    // For values smaller than 0.0001 BSV, show 8 decimal places (satoshi precision)
    return `${bsv.toFixed(8)} BSV`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getNodeColor = (type: TxGraphNode['type']): string => {
    switch (type) {
      case 'root': return '#60a5fa';
      case 'intermediate': return '#3b82f6';
      case 'utxo': return '#f59e0b';
      case 'fee-consumed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getNodeDimensions = (type: TxGraphNode['type']): { width: number; height: number } => {
    switch (type) {
      case 'root': return { width: 200, height: 60 };
      case 'intermediate': return { width: 180, height: 50 };
      case 'utxo': return { width: 160, height: 45 };
      case 'fee-consumed': return { width: 160, height: 45 };
      default: return { width: 180, height: 50 };
    }
  };

  const renderNode = (node: TxGraphNode) => {
    const { width, height } = getNodeDimensions(node.type);
    const color = getNodeColor(node.type);
    const isSelected = selectedNode === node.txid;

    // Truncate TXID for display
    const displayTxid = node.txid.length > 16
      ? `${node.txid.substring(0, 8)}...${node.txid.substring(node.txid.length - 8)}`
      : node.txid;

    return (
      <g key={node.txid}>
        {/* Node rectangle */}
        <rect
          x={node.position.x - width / 2}
          y={node.position.y - height / 2}
          width={width}
          height={height}
          rx={8}
          fill={color}
          stroke={isSelected ? '#ffffff' : 'none'}
          strokeWidth={isSelected ? 2 : 0}
          className="cursor-pointer hover:brightness-110 transition-all"
          onClick={() => setSelectedNode(node.txid)}
        />

        {/* Text */}
        <text
          x={node.position.x}
          y={node.position.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize="12"
          fontFamily="monospace"
          className="pointer-events-none select-none"
        >
          {displayTxid}
        </text>

        {/* Copy button on hover */}
        <circle
          cx={node.position.x + width / 2 - 12}
          cy={node.position.y - height / 2 + 12}
          r={8}
          fill="rgba(0, 0, 0, 0.5)"
          className="cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(node.txid);
          }}
        />
        <text
          x={node.position.x + width / 2 - 12}
          y={node.position.y - height / 2 + 12}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize="10"
          className="pointer-events-none select-none"
        >
          📋
        </text>
      </g>
    );
  };

  const renderEdge = (edge: GraphEdge, index: number) => {
    const fromNode = graphData?.nodes.get(edge.from);
    const toNode = graphData?.nodes.get(edge.to);

    if (!fromNode || !toNode) return null;

    const fromDims = getNodeDimensions(fromNode.type);
    const toDims = getNodeDimensions(toNode.type);

    const x1 = fromNode.position.x;
    const y1 = fromNode.position.y + fromDims.height / 2;
    const x2 = toNode.position.x;
    const y2 = toNode.position.y - toDims.height / 2;

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const edgeColor = edge.type === 'utxo' ? '#f59e0b' : edge.type === 'fee' ? '#ef4444' : '#3b82f6';

    return (
      <g key={`edge-${index}`}>
        {/* Edge line */}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={edgeColor}
          strokeWidth={2}
          markerEnd="url(#arrowhead)"
          opacity={0.6}
        />

        {/* Edge label - shows BSV value */}
        <g>
          <rect
            x={midX - 45}
            y={midY - 8}
            width={90}
            height={16}
            rx={4}
            fill="rgba(0, 0, 0, 0.7)"
          />
          <text
            x={midX}
            y={midY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize="10"
            fontFamily="monospace"
            className="pointer-events-none select-none"
          >
            {formatBSV(edge.value)}
          </text>
        </g>
      </g>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Compact Controls Bar */}
      <div className="flex-shrink-0 bg-[#111827] border-b border-[#1e3a5f] px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          {/* TXID Input */}
          <div className="flex-1 min-w-[300px] flex gap-2">
            <input
              type="text"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
              placeholder="Enter transaction ID..."
              className="flex-1 bg-[#0a0e1a] border border-[#1e3a5f] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#3b82f6]"
              disabled={status === 'running'}
            />

            {(status === 'idle' || status === 'completed' || status === 'stopped') && (
              <button
                onClick={handleStart}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              >
                {status === 'idle' ? 'Start' : 'Restart'}
              </button>
            )}

            {status === 'running' && (
              <>
                <button
                  onClick={handlePause}
                  className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded transition-colors"
                >
                  Pause
                </button>
                <button
                  onClick={handleStop}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                >
                  Stop
                </button>
              </>
            )}

            {status === 'paused' && (
              <>
                <button
                  onClick={handleResume}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                >
                  Resume
                </button>
                <button
                  onClick={handleStop}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                >
                  Stop
                </button>
              </>
            )}
          </div>

          {/* Parameters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-[#d1d5db]">Min:</label>
              <input
                type="number"
                value={minValueBSV}
                onChange={(e) => setMinValueBSV(e.target.value)}
                placeholder="0"
                step="0.0001"
                min="0"
                className="w-20 bg-[#0a0e1a] border border-[#1e3a5f] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#3b82f6]"
                disabled={status === 'running'}
              />
              <span className="text-xs text-[#d1d5db]">BSV</span>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-[#d1d5db]">Depth:</label>
              <input
                type="number"
                value={maxDepth}
                onChange={(e) => setMaxDepth(e.target.value)}
                placeholder="4"
                step="1"
                min="0"
                className="w-14 bg-[#0a0e1a] border border-[#1e3a5f] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#3b82f6]"
                disabled={status === 'running'}
              />
            </div>
          </div>

          {/* Sample buttons */}
          <div className="flex items-center gap-2">
            {SAMPLE_TXS[network].map((sampleTxid, idx) => (
              <button
                key={idx}
                onClick={() => handleSampleTx(sampleTxid)}
                className="px-2 py-1 text-xs bg-[#1a2332] hover:bg-[#243447] text-white rounded transition-colors"
                disabled={status === 'running'}
              >
                Sample {idx + 1}
              </button>
            ))}
          </div>

          {/* Stats Toggle */}
          {graphData && (
            <button
              onClick={() => setShowStats(!showStats)}
              className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                showStats ? 'bg-[#3b82f6] text-white' : 'bg-[#1a2332] hover:bg-[#243447] text-white'
              }`}
            >
              <span>Stats</span>
              <svg
                className={`w-3 h-3 transition-transform ${showStats ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Statistics Panel */}
      <div
        className={`flex-shrink-0 bg-[#111827] border-b border-[#1e3a5f] overflow-hidden transition-all duration-300 ease-in-out ${
          showStats && graphData ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[#d1d5db]">Nodes:</span>
              <span className="font-bold text-[#3b82f6]">{graphData?.stats.totalNodes || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#d1d5db]">UTXOs:</span>
              <span className="font-bold text-[#f59e0b]">{graphData?.stats.totalUTXOs || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#d1d5db]">Depth:</span>
              <span className="font-bold text-[#60a5fa]">{graphData?.stats.maxDepth || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#d1d5db]">Time:</span>
              <span className="font-bold text-white">{graphData ? formatDuration(graphData.stats.elapsedTime) : '0s'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#d1d5db]">Fees:</span>
              <span className="font-bold text-[#ef4444]">{formatSatoshis(graphData?.stats.totalFeeConsumed || 0)} sats</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#d1d5db]">API Calls:</span>
              <span className="font-bold text-white">{graphData?.stats.apiCallsCount || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#d1d5db]">Queue:</span>
              <span className="font-bold text-white">{graphData?.stats.queueSize || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#d1d5db]">Status:</span>
              <span className="font-bold text-white capitalize">{status}</span>
              {status === 'running' && (
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-Page Graph Area */}
      <div className="flex-1 relative overflow-hidden bg-[#0a0e1a]">
        {/* Empty state */}
        {(!graphData || graphData.nodes.size === 0) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-[#64748b]">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-lg">Enter a transaction ID and click Start</p>
              <p className="text-sm mt-2">or try one of the sample transactions</p>
            </div>
          </div>
        )}

        {/* Graph SVG - Full area */}
        {graphData && graphData.nodes.size > 0 && (
          <div className="absolute inset-0 overflow-auto">
            <svg
              width={Math.max(svgDimensions.width, 1200)}
              height={Math.max(svgDimensions.height, 600)}
              className="min-w-full"
            >
              {/* Arrow marker definition */}
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
                </marker>
              </defs>

              {/* Render edges first (behind nodes) */}
              {graphData.edges.map((edge, idx) => renderEdge(edge, idx))}

              {/* Render nodes */}
              {Array.from(graphData.nodes.values()).map(node => renderNode(node))}
            </svg>
          </div>
        )}

        {/* Floating Legend - Bottom Left */}
        {graphData && graphData.nodes.size > 0 && (
          <div className="absolute bottom-4 left-4 bg-[#0a0e1a]/80 backdrop-blur-sm rounded-lg p-3 border border-[#1e3a5f]">
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#60a5fa' }}></div>
                <span className="text-[#d1d5db]">Root</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }}></div>
                <span className="text-[#d1d5db]">Intermediate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }}></div>
                <span className="text-[#d1d5db]">UTXO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }}></div>
                <span className="text-[#d1d5db]">Fee</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected Node Details - Bottom Right */}
        {selectedNode && graphData && (
          <div className="absolute bottom-4 right-4 bg-[#0a0e1a]/80 backdrop-blur-sm rounded-lg p-3 border border-[#1e3a5f] max-w-sm">
            <div className="text-xs text-[#d1d5db] mb-1">Selected Node</div>
            <div className="font-mono text-xs break-all text-[#3b82f6]">{selectedNode}</div>
            <button
              onClick={() => copyToClipboard(selectedNode)}
              className="mt-2 px-2 py-1 text-xs bg-[#1a2332] hover:bg-[#243447] text-white rounded transition-colors"
            >
              Copy TXID
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
