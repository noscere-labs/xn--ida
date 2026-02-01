'use client'

import { useCallback, useEffect, useState } from 'react'
import { Network, whatsOnChainService, TransactionInfo } from '../services/whatsonchain'

interface GraphNode {
  txid: string
  type: 'focus' | 'input' | 'output' | 'utxo'
  position: { x: number; y: number }
  value?: number
  isSpent?: boolean
  outputIndex?: number
}

interface GraphConnection {
  from: string
  to: string
  type: 'input' | 'output'
  outputIndex?: number
}

interface GraphData {
  focusNode: GraphNode
  inputNodes: GraphNode[]
  outputNodes: GraphNode[]
  connections: GraphConnection[]
}

interface NavigationHistory {
  txid: string
  timestamp: number
}

interface TxWalkerProps {
  network?: Network
}

export default function TxWalker({ network = 'main' }: TxWalkerProps) {
  const [, setFocusedTxid] = useState<string | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [txInput, setTxInput] = useState<string>('')
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistory[]>([])
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1)
  const [focusedTransaction, setFocusedTransaction] = useState<TransactionInfo | null>(null)
  const [showInfoPane, setShowInfoPane] = useState<boolean>(false)

  // Sync network with WhatsOnChain service
  useEffect(() => {
    whatsOnChainService.setNetwork(network);
  }, [network]);

  // Sync input field with focused transaction
  useEffect(() => {
    if (focusedTransaction) {
      setTxInput(focusedTransaction.txid);
    }
  }, [focusedTransaction]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const addToHistory = useCallback((txid: string) => {
    const newHistoryItem: NavigationHistory = {
      txid,
      timestamp: Date.now()
    }
    
    // If we're not at the end of history, remove everything after current position
    if (currentHistoryIndex < navigationHistory.length - 1) {
      const newHistory = navigationHistory.slice(0, currentHistoryIndex + 1)
      newHistory.push(newHistoryItem)
      setNavigationHistory(newHistory)
      setCurrentHistoryIndex(newHistory.length - 1)
    } else {
      const newHistory = [...navigationHistory, newHistoryItem]
      setNavigationHistory(newHistory)
      setCurrentHistoryIndex(newHistory.length - 1)
    }
  }, [navigationHistory, currentHistoryIndex])

  const loadTransactionGraph = useCallback(async (txid: string, addToNav: boolean = true) => {
    if (!txid.trim()) return

    setLoading(true)
    setError(null)

    try {
      // Get the main transaction details
      const transaction = await whatsOnChainService.getTransaction(txid.trim())
      setFocusedTransaction(transaction)

      // Create focus node
      const focusNode: GraphNode = {
        txid: transaction.txid,
        type: 'focus',
        position: { x: 400, y: 300 }, // Center of SVG
        value: transaction.vout.reduce((sum, output) => sum + output.value, 0)
      }

      // Create input nodes (transactions that this tx spends from) - positioned on the LEFT
      const inputNodes: GraphNode[] = []
      const inputConnections: GraphConnection[] = []
      
      const inputXOffset = -250 // Fixed left offset from focus node
      const inputVerticalSpacing = 80 // Vertical spacing between input nodes
      const inputStartY = focusNode.position.y - ((transaction.vin.length - 1) * inputVerticalSpacing / 2)

      for (let i = 0; i < transaction.vin.length; i++) {
        const input = transaction.vin[i]
        const x = focusNode.position.x + inputXOffset
        const y = inputStartY + (i * inputVerticalSpacing)

        inputNodes.push({
          txid: input.txid,
          type: 'input',
          position: { x, y },
          outputIndex: input.vout
        })

        inputConnections.push({
          from: input.txid,
          to: transaction.txid,
          type: 'input',
          outputIndex: input.vout
        })
      }

      // Check spent status for all outputs
      const spentStatusPromises = transaction.vout.map(output => 
        whatsOnChainService.getSpentStatus(transaction.txid, output.n)
      )
      
      const spentStatuses = await Promise.all(spentStatusPromises)

      // Create output nodes - positioned on the RIGHT
      const outputNodes: GraphNode[] = []
      const outputConnections: GraphConnection[] = []
      
      const outputXOffset = 250 // Fixed right offset from focus node
      const outputVerticalSpacing = 80 // Vertical spacing between output nodes
      const outputStartY = focusNode.position.y - ((transaction.vout.length - 1) * outputVerticalSpacing / 2)

      for (let i = 0; i < transaction.vout.length; i++) {
        const output = transaction.vout[i]
        const spentInfo = spentStatuses[i]
        const x = focusNode.position.x + outputXOffset
        const y = outputStartY + (i * outputVerticalSpacing)

        if (spentInfo) {
          // Output is spent - create a node for the spending transaction
          outputNodes.push({
            txid: spentInfo.txid,
            type: 'output',
            position: { x, y },
            value: output.value,
            isSpent: true,
            outputIndex: output.n
          })

          outputConnections.push({
            from: transaction.txid,
            to: spentInfo.txid,
            type: 'output',
            outputIndex: output.n
          })
        } else {
          // Output is unspent - create a UTXO node
          outputNodes.push({
            txid: `${transaction.txid}:${output.n}`,
            type: 'utxo',
            position: { x, y },
            value: output.value,
            isSpent: false,
            outputIndex: output.n
          })

          outputConnections.push({
            from: transaction.txid,
            to: `${transaction.txid}:${output.n}`,
            type: 'output',
            outputIndex: output.n
          })
        }
      }

      const newGraphData: GraphData = {
        focusNode,
        inputNodes,
        outputNodes,
        connections: [...inputConnections, ...outputConnections]
      }

      setGraphData(newGraphData)
      setFocusedTxid(transaction.txid)
      
      if (addToNav) {
        addToHistory(transaction.txid)
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load transaction data')
      setFocusedTransaction(null)
      setGraphData(null)
    } finally {
      setLoading(false)
    }
  }, [addToHistory])

  const handleTransactionInput = async () => {
    if (!txInput.trim()) return
    await loadTransactionGraph(txInput.trim())
  }

  const handleNodeClick = useCallback(async (node: GraphNode) => {
    if (node.type === 'focus' || node.type === 'utxo') return
    
    if (node.type === 'input') {
      await loadTransactionGraph(node.txid)
      setSelectedNode(null)
    } else if (node.type === 'output' && node.isSpent) {
      await loadTransactionGraph(node.txid)
      setSelectedNode(null)
    }
  }, [loadTransactionGraph])

  const navigateBack = useCallback(async () => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1
      const historyItem = navigationHistory[newIndex]
      setCurrentHistoryIndex(newIndex)
      await loadTransactionGraph(historyItem.txid, false)
    }
  }, [currentHistoryIndex, navigationHistory, loadTransactionGraph])

  const navigateForward = useCallback(async () => {
    if (currentHistoryIndex < navigationHistory.length - 1) {
      const newIndex = currentHistoryIndex + 1
      const historyItem = navigationHistory[newIndex]
      setCurrentHistoryIndex(newIndex)
      await loadTransactionGraph(historyItem.txid, false)
    }
  }, [currentHistoryIndex, navigationHistory, loadTransactionGraph])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        navigateBack()
      } else if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault()
        navigateForward()
      } else if (event.key === 'Escape' && showInfoPane) {
        setShowInfoPane(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigateBack, navigateForward, showInfoPane])

  const renderNode = (node: GraphNode) => {
    const isSelected = selectedNode === node.txid
    const isClickable = (node.type === 'input') || (node.type === 'output' && node.isSpent)
    
    let fillColor = '#374151' // Default gray
    let strokeColor = '#6b7280'
    let width = 120
    let height = 40
    
    switch (node.type) {
      case 'focus':
        fillColor = '#60a5fa'
        strokeColor = '#ffffff'
        width = 200
        height = 50
        break
      case 'input':
        fillColor = '#3b82f6'
        strokeColor = isSelected ? '#ffffff' : '#2563eb'
        width = 160
        height = 45
        break
      case 'output':
        fillColor = '#22c55e'
        strokeColor = isSelected ? '#ffffff' : '#4ade80'
        width = 160
        height = 45
        break
      case 'utxo':
        fillColor = '#f59e0b'
        strokeColor = '#fbbf24'
        width = 140
        height = 40
        break
    }

    // Prepare text content based on node type
    let displayText = ''
    let fontSize = '10'
    
    if (node.type === 'focus') {
      // Show full txid (truncated if too long)
      displayText = node.txid.length > 24 ? `${node.txid.substring(0, 24)}...` : node.txid
      fontSize = '9'
    } else if (node.type === 'utxo') {
      // Show outpoint format for UTXO: txid:vout
      const baseTxid = node.txid.split(':')[0]
      const vout = node.txid.split(':')[1] || '0'
      displayText = `${baseTxid.substring(0, 12)}...:${vout}`
      fontSize = '9'
    } else {
      // For input/output nodes, show outpoint: txid:vout
      const vout = node.outputIndex ?? 0
      displayText = `${node.txid.substring(0, 12)}...:${vout}`
      fontSize = '9'
    }

    return (
      <g key={`${node.type}-${node.txid}-${node.outputIndex ?? ''}`}>
        {/* Main node rounded rectangle */}
        <rect
          x={node.position.x - width / 2}
          y={node.position.y - height / 2}
          width={width}
          height={height}
          rx={12}
          ry={12}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isSelected ? 3 : 2}
          className={isClickable ? 'cursor-pointer hover:brightness-110' : ''}
          onClick={isClickable ? () => handleNodeClick(node) : undefined}
          onMouseEnter={() => isClickable && setSelectedNode(node.txid)}
          onMouseLeave={() => isClickable && setSelectedNode(null)}
        />
        
        {/* Node text content */}
        <text
          x={node.position.x}
          y={node.position.y + 3}
          textAnchor="middle"
          className="fill-white font-mono pointer-events-none select-none"
          fontSize={fontSize}
          fontWeight="500"
        >
          {displayText}
        </text>
        
      </g>
    )
  }

  const renderConnection = (connection: GraphConnection) => {
    if (!graphData) return null
    
    const fromNode = connection.type === 'input' 
      ? graphData.inputNodes.find(n => n.txid === connection.from)
      : graphData.focusNode
    const toNode = connection.type === 'input' 
      ? graphData.focusNode
      : graphData.outputNodes.find(n => n.txid === connection.to)
    
    if (!fromNode || !toNode) return null
    
    const strokeColor = connection.type === 'input' ? '#3b82f6' : '#22c55e'
    
    // Calculate midpoint for label positioning (accounting for ellipse edges)
    const x1 = connection.type === 'input' ? fromNode.position.x + 80 : fromNode.position.x - 100
    const x2 = connection.type === 'input' ? toNode.position.x - 100 : toNode.position.x + 80
    const midX = (x1 + x2) / 2
    const midY = (fromNode.position.y + toNode.position.y) / 2
    
    // Determine the index label based on connection type
    let indexLabel = ''
    if (connection.type === 'input') {
      // For inputs, find the input index in the transaction
      const inputIndex = graphData.inputNodes.findIndex(n => n.txid === connection.from && n.outputIndex === connection.outputIndex)
      indexLabel = `in:${inputIndex}`
    } else {
      // For outputs, use the output index directly
      indexLabel = `out:${connection.outputIndex ?? 0}`
    }
    
    return (
      <g key={`${connection.from}-${connection.to}-${connection.outputIndex}`}>
        <line
          x1={connection.type === 'input' ? fromNode.position.x + 80 : fromNode.position.x - 100}
          y1={fromNode.position.y}
          x2={connection.type === 'input' ? toNode.position.x - 100 : toNode.position.x + 80}
          y2={toNode.position.y}
          stroke={strokeColor}
          strokeWidth={2}
          markerEnd="url(#arrowhead)"
        />
        
        {/* Index label */}
        <g>
          {/* Label background */}
          <rect
            x={midX - 22}
            y={midY - 8}
            width={44}
            height={16}
            rx={3}
            ry={3}
            fill="rgba(0, 0, 0, 0.8)"
            stroke={strokeColor}
            strokeWidth={1}
          />
          
          {/* Label text */}
          <text
            x={midX}
            y={midY + 4}
            textAnchor="middle"
            className="text-xs fill-white font-mono pointer-events-none select-none"
            fontSize="10"
          >
            {indexLabel}
          </text>
        </g>
      </g>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-4xl sm:text-4xl font-bold mb-4">
          <span className="text-[#3b82f6]">
            Transaction Walker
          </span>
        </h1>
        <p className="text-xl text-[#d1d5db] max-w-3xl mx-auto">
          Navigate through Bitcoin transaction graphs by exploring inputs and outputs
        </p>
      </div>

      <div className="bg-[#111827] rounded-lg p-6">
        {/* Transaction Input Section */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-white text-sm font-medium mb-2">
                Transaction ID:
              </label>
              <input
                type="text"
                value={txInput}
                onChange={(e) => setTxInput(e.target.value)}
                placeholder="Enter transaction ID to start exploring..."
                className="w-full p-3 bg-[#1a2332] border border-gray-600 rounded-lg text-white font-mono text-sm"
                onKeyPress={(e) => e.key === 'Enter' && handleTransactionInput()}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleTransactionInput}
                disabled={!txInput.trim() || loading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {loading ? 'Loading...' : 'Explore'}
              </button>
            </div>
          </div>
          
          {/* Navigation Controls */}
          {navigationHistory.length > 0 && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={navigateBack}
                disabled={currentHistoryIndex <= 0}
                className="px-4 py-2 bg-[#1a2332] hover:bg-[#243447] disabled:bg-[#1a2332] disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
                title="Navigate back"
              >
                ⬅️ Back
              </button>
              <button
                onClick={navigateForward}
                disabled={currentHistoryIndex >= navigationHistory.length - 1}
                className="px-4 py-2 bg-[#1a2332] hover:bg-[#243447] disabled:bg-[#1a2332] disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
                title="Navigate forward"
              >
                Forward ➡️
              </button>
              <div className="flex items-center px-3 py-2 bg-[#1a2332] rounded text-sm text-[#cbd5e1]">
                {currentHistoryIndex + 1} / {navigationHistory.length}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Main Content Area - Full Width Visualization */}
        <div className="relative">
          {/* Graph Visualization - Full Width */}
          {loading ? (
            <div className="flex items-center justify-center h-96 bg-[#1a2332] rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[#cbd5e1]">Loading transaction graph...</span>
              </div>
            </div>
          ) : graphData ? (
            <div className="bg-[#0a0e1a] rounded-lg border border-[#1e3a5f] overflow-hidden">
              <svg width="900" height="600" viewBox="0 0 900 600" className="w-full h-auto min-h-[70vh]">
                {/* Define arrow marker */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 10 3.5, 0 7"
                      fill="#ffffff"
                    />
                  </marker>
                </defs>
                
                {/* Render connections first (behind nodes) */}
                {graphData.connections.map(renderConnection)}
                
                {/* Render nodes */}
                {renderNode(graphData.focusNode)}
                {graphData.inputNodes.map(renderNode)}
                {graphData.outputNodes.map(renderNode)}
              </svg>
            </div>
          ) : (
            <div className="flex items-center justify-center h-96 bg-[#1a2332] rounded-lg">
              <div className="text-center">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-white mb-2">No Transaction Loaded</h3>
                <p className="text-[#94a3b8]">Enter a transaction ID above to start exploring the transaction graph.</p>
              </div>
            </div>
          )}

          {/* Transaction Details Overlay - Bottom Panel */}
          {showInfoPane && focusedTransaction && (
            <div className={`absolute bottom-0 left-0 right-0 bg-[#1a2332]/95 backdrop-blur-sm border-t border-gray-600 rounded-t-lg shadow-2xl transform transition-transform duration-300 ease-in-out max-h-[50vh] overflow-hidden ${
              showInfoPane ? 'translate-y-0' : 'translate-y-full'
            }`}>
              <div className="p-4 max-h-[50vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Transaction Details</h3>
                  <button
                    onClick={() => setShowInfoPane(false)}
                    className="text-[#94a3b8] hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="space-y-4 text-sm">
                  {/* Transaction Hash */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#94a3b8]">Transaction ID:</span>
                      <button
                        onClick={() => copyToClipboard(focusedTransaction.txid)}
                        className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div className="p-2 bg-gray-900 rounded border font-mono text-xs text-blue-400 break-all">
                      {focusedTransaction.txid}
                    </div>
                  </div>

                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[#94a3b8]">Size:</span>
                      <div className="text-white">{focusedTransaction.size} bytes</div>
                    </div>
                    <div>
                      <span className="text-[#94a3b8]">Version:</span>
                      <div className="text-white">{focusedTransaction.version}</div>
                    </div>
                    {focusedTransaction.confirmations && (
                      <>
                        <div>
                          <span className="text-[#94a3b8]">Confirmations:</span>
                          <div className="text-green-400">{focusedTransaction.confirmations}</div>
                        </div>
                        <div>
                          <span className="text-[#94a3b8]">Block Height:</span>
                          <div className="text-white">{focusedTransaction.blockheight}</div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Inputs */}
                  <div>
                    <h4 className="text-white font-semibold mb-2">Inputs ({focusedTransaction.vin.length}):</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {focusedTransaction.vin.map((input, index) => (
                        <div key={index} className="p-2 bg-gray-900 rounded border">
                          <div className="flex items-center justify-between">
                            <div className="font-mono text-xs text-blue-400 break-all flex-1 mr-2">
                              {input.txid}:{input.vout}
                            </div>
                            <button
                              onClick={() => loadTransactionGraph(input.txid)}
                              className="flex-shrink-0 p-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors"
                              title="Navigate to input transaction"
                            >
                              ⬅️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Outputs */}
                  <div>
                    <h4 className="text-white font-semibold mb-2">Outputs ({focusedTransaction.vout.length}):</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {focusedTransaction.vout.map((output, index) => {
                        // Check if this output is spent by finding it in the graph data
                        const isSpent = graphData?.outputNodes.find(node => 
                          node.outputIndex === output.n && node.isSpent
                        );
                        const spentTxid = isSpent?.txid;
                        
                        return (
                          <div key={index} className="p-2 bg-gray-900 rounded border">
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[#94a3b8]">Output {output.n}:</span>
                                <span className="text-green-400 text-xs">{output.value} BSV</span>
                              </div>
                              {isSpent && spentTxid && (
                                <button
                                  onClick={() => loadTransactionGraph(spentTxid)}
                                  className="flex-shrink-0 p-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors"
                                  title="Navigate to spending transaction"
                                >
                                  ➡️
                                </button>
                              )}
                            </div>
                            {output.scriptPubKey.addresses && output.scriptPubKey.addresses.length > 0 && (
                              <div className="font-mono text-xs text-[#94a3b8] break-all">
                                {output.scriptPubKey.addresses[0]}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info Pane Toggle (when collapsed) */}
          {!showInfoPane && focusedTransaction && (
            <button
              onClick={() => setShowInfoPane(true)}
              className="absolute bottom-4 right-4 p-3 bg-[#1a2332] hover:bg-[#243447] text-white rounded-lg transition-colors shadow-lg z-20"
              title="Show transaction details"
            >
              📊
            </button>
          )}
        </div>

        {/* Instructions */}
        {!focusedTransaction && (
          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <h4 className="text-blue-400 font-semibold mb-2">How to use Transaction Walker:</h4>
            <ul className="text-blue-300 text-sm space-y-1">
              <li>• Enter a transaction ID to set it as the focus node</li>
              <li>• <span className="inline-block w-3 h-3 bg-blue-500 rounded mr-1"></span> Blue nodes (left): input transactions (click to navigate)</li>
              <li>• <span className="inline-block w-3 h-3 bg-green-500 rounded mr-1"></span> Green nodes (right): spending transactions (click to navigate)</li>
              <li>• <span className="inline-block w-3 h-3 bg-yellow-500 rounded mr-1"></span> Yellow nodes (right): unspent outputs (UTXOs)</li>
              <li>• <span className="inline-block w-3 h-3 bg-purple-500 rounded mr-1"></span> Purple node (center): currently focused transaction</li>
              <li>• Connection lines show input/output indices (in:0, out:1, etc.)</li>
              <li>• Nodes display transaction IDs and outpoints (txid:vout)</li>
              <li>• Use Back/Forward buttons or Alt+←/→ to navigate history</li>
            </ul>
          </div>
        )}

        {/* Sample Transaction IDs for quick testing */}
        {!focusedTransaction && (
          <div className="mt-4 p-4 bg-[#1a2332]/50 border border-gray-600 rounded-lg">
            <h4 className="text-[#cbd5e1] font-semibold mb-3">Sample Transaction IDs ({network === 'main' ? 'Mainnet' : 'Testnet'}):</h4>
            <div className="flex flex-wrap gap-2">
              {network === 'main' ? (
                <>
                  <button
                    onClick={() => setTxInput('c1d32f28baa27a376ba977f6a8de6ce0a87041157cef0274b20bfda2b0d8df96')}
                    className="px-3 py-1 bg-[#1a2332] hover:bg-[#243447] text-[#e2e8f0] rounded text-sm font-mono transition-colors"
                  >
                    c1d32f28...
                  </button>
                  <button
                    onClick={() => setTxInput('4bdbdb7483c1c7ef48cda78ee4141af7cf15f94e10324e0bcac43c29394ea4a9')}
                    className="px-3 py-1 bg-[#1a2332] hover:bg-[#243447] text-[#e2e8f0] rounded text-sm font-mono transition-colors"
                  >
                    4bdbdb74...
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setTxInput('294cd1ebd5689fdee03509f92c32184c0f52f037d4046af250229b97e0c8f1aa')}
                    className="px-3 py-1 bg-[#1a2332] hover:bg-[#243447] text-[#e2e8f0] rounded text-sm font-mono transition-colors"
                  >
                    294cd1eb...
                  </button>
                  <button
                    onClick={() => setTxInput('91f68c2c598bc73812dd32d60ab67005eac498bef5f0c45b822b3c9468ba3258')}
                    className="px-3 py-1 bg-[#1a2332] hover:bg-[#243447] text-[#e2e8f0] rounded text-sm font-mono transition-colors"
                  >
                    91f68c2c...
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}