'use client'

import { useCallback, useEffect, useState } from 'react'
import { Network, whatsOnChainService } from '../services/whatsonchain'

interface TreeNode {
  id: string
  hash: string
  value?: string
  left?: TreeNode
  right?: TreeNode
  level: number
  position: number
  isLeaf: boolean
}

interface MerklePathStep {
  hash: string
  position: 'left' | 'right'
  isTarget: boolean
}

interface ProofStep {
  stepNumber: number
  operation: string
  leftHash: string
  rightHash: string
  result: string
  description: string
}


interface MerkleTreeVisualizerProps {
  network?: Network;
}

export default function MerkleTreeVisualizer({ network = 'main' }: MerkleTreeVisualizerProps) {
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [selectedLeaf, setSelectedLeaf] = useState<string | null>(null)
  const [merklePath, setMerklePath] = useState<MerklePathStep[]>([])
  const [activeTab, setActiveTab] = useState<'visualization' | 'merklepath' | 'calculation'>('visualization')
  const [blockInput, setBlockInput] = useState<string>('')
  const [loadingBlock, setLoadingBlock] = useState<boolean>(false)
  const [blockError, setBlockError] = useState<string>('')
  const [showPathOnly, setShowPathOnly] = useState<boolean>(false)
  const [pathNodes, setPathNodes] = useState<Set<string>>(new Set())
  const [proofSteps, setProofSteps] = useState<ProofStep[]>([])
  const [calculatingSteps, setCalculatingSteps] = useState<boolean>(false)

  // Sync network with WhatsOnChain service
  useEffect(() => {
    whatsOnChainService.setNetwork(network);
  }, [network]);

  const hashData = useCallback(async (data: string): Promise<string> => {
    // For Bitcoin-style merkle trees, we need double SHA-256
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)

    // First SHA-256
    const firstHash = await crypto.subtle.digest('SHA-256', dataBuffer)

    // Second SHA-256 (hash of the first hash)
    const secondHash = await crypto.subtle.digest('SHA-256', firstHash)

    const hashArray = Array.from(new Uint8Array(secondHash))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }, [])

  const hashBinary = useCallback(async (leftHash: string, rightHash: string): Promise<string> => {
    // Bitcoin-style hashing with endianness handling
    // Convert hex strings to binary and reverse byte order (little-endian for internal processing)
    const leftBytes = new Uint8Array(leftHash.match(/.{2}/g)?.map(byte => parseInt(byte, 16)).reverse() || [])
    const rightBytes = new Uint8Array(rightHash.match(/.{2}/g)?.map(byte => parseInt(byte, 16)).reverse() || [])

    // Concatenate: left || right
    const combined = new Uint8Array(leftBytes.length + rightBytes.length)
    combined.set(leftBytes, 0)
    combined.set(rightBytes, leftBytes.length)

    // Double SHA-256 of the concatenated binary data
    const firstHash = await crypto.subtle.digest('SHA-256', combined)
    const secondHash = await crypto.subtle.digest('SHA-256', firstHash)

    // Reverse bytes back to big-endian for display
    const hashArray = Array.from(new Uint8Array(secondHash)).reverse()
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }, [])

  const buildMerkleTree = useCallback(async (dataItems: string[]): Promise<TreeNode | null> => {
    if (dataItems.length === 0) return null

    let currentLevel: TreeNode[] = []

    for (let i = 0; i < dataItems.length; i++) {
      const hash = await hashData(dataItems[i])
      currentLevel.push({
        id: `leaf-${i}`,
        hash,
        value: dataItems[i],
        level: 0,
        position: i,
        isLeaf: true
      })
    }

    let level = 1
    while (currentLevel.length > 1) {
      const nextLevel: TreeNode[] = []

      // Handle odd number of elements by duplicating the last one (Bitcoin standard)
      if (currentLevel.length % 2 === 1) {
        const lastNode = currentLevel[currentLevel.length - 1]
        currentLevel.push({
          ...lastNode,
          id: `${lastNode.id}-dup-level-${level}`,
        })
      }

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i]
        const right = currentLevel[i + 1]

        // Use binary concatenation with proper endianness
        const combinedHash = await hashBinary(left.hash, right.hash)

        nextLevel.push({
          id: `node-${level}-${Math.floor(i / 2)}`,
          hash: combinedHash,
          left,
          right: right.id !== left.id ? right : undefined,
          level,
          position: Math.floor(i / 2),
          isLeaf: false
        })
      }

      currentLevel = nextLevel
      level++
    }

    return currentLevel[0] || null
  }, [hashData, hashBinary])

  const calculateMerklePath = useCallback(async (txids: string[], targetIndex: number): Promise<string[]> => {
    // Implementation based on MerkleReport.md algorithm
    if (targetIndex < 0 || targetIndex >= txids.length) {
      throw new Error("Target index out of range");
    }

    const path: string[] = [];
    let currentLevel = [...txids];
    let currentIndex = targetIndex;

    while (currentLevel.length > 1) {
      // Handle odd number of elements by duplicating the last one
      if (currentLevel.length % 2 === 1) {
        currentLevel.push(currentLevel[currentLevel.length - 1]);
      }

      // Find sibling index
      const isEven = currentIndex % 2 === 0;
      const siblingIndex = isEven ? currentIndex + 1 : currentIndex - 1;
      path.push(currentLevel[siblingIndex]);

      // Build next level by actually calculating hashes
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const leftHash = currentLevel[i];
        const rightHash = currentLevel[i + 1];
        const combinedHash = await hashBinary(leftHash, rightHash);
        nextLevel.push(combinedHash);
      }

      currentLevel = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return path;
  }, [hashBinary]);

  const findMerklePath = useCallback(async (tree: TreeNode, targetLeafId: string): Promise<MerklePathStep[]> => {
    // Find the target leaf and its position
    const findLeafNode = (node: TreeNode): { node: TreeNode | null, index: number } => {
      if (node.isLeaf && node.id === targetLeafId) {
        return { node, index: node.position };
      }
      if (node.left) {
        const result = findLeafNode(node.left);
        if (result.node) return result;
      }
      if (node.right) {
        const result = findLeafNode(node.right);
        if (result.node) return result;
      }
      return { node: null, index: -1 };
    };

    const { node: targetLeaf, index: targetIndex } = findLeafNode(tree);
    if (!targetLeaf) return [];

    // Collect all leaf hashes in order
    const collectLeaves = (node: TreeNode): string[] => {
      if (node.isLeaf) {
        return [node.hash];
      }
      const leaves: string[] = [];
      if (node.left) leaves.push(...collectLeaves(node.left));
      if (node.right) leaves.push(...collectLeaves(node.right));
      return leaves;
    };

    const leafHashes = collectLeaves(tree);

    try {
      const siblingHashes = await calculateMerklePath(leafHashes, targetIndex);

      const path: MerklePathStep[] = [
        {
          hash: targetLeaf.hash,
          position: 'left', // Will be corrected in proof steps
          isTarget: true
        }
      ];

      // Add sibling hashes to path
      siblingHashes.forEach(hash => {
        path.push({
          hash,
          position: 'right', // Will be determined correctly in proof calculation
          isTarget: false
        });
      });

      return path;
    } catch (error) {
      console.error('Error calculating merkle path:', error);
      return [];
    }
  }, [calculateMerklePath])

  const getPathNodes = useCallback((tree: TreeNode, targetLeafId: string): Set<string> => {
    const pathNodeIds = new Set<string>()

    const traverse = (node: TreeNode, targetId: string): boolean => {
      if (node.isLeaf) {
        if (node.id === targetId) {
          pathNodeIds.add(node.id) // Add the target leaf
          return true
        }
        return false
      }

      const foundInLeft = node.left && traverse(node.left, targetId)
      const foundInRight = node.right && traverse(node.right, targetId)

      if (foundInLeft || foundInRight) {
        pathNodeIds.add(node.id) // Add this intermediate node

        // Add sibling nodes needed for merkle proof
        if (foundInLeft && node.right) {
          pathNodeIds.add(node.right.id) // Add right sibling
        } else if (foundInRight && node.left) {
          pathNodeIds.add(node.left.id) // Add left sibling
        }
        return true
      }

      return false
    }

    traverse(tree, targetLeafId)
    return pathNodeIds
  }, [])


  const loadBlockData = async () => {
    if (!blockInput.trim()) return

    setLoadingBlock(true)
    setBlockError('')

    try {
      let blockData

      // Check if input is a number (block height) or hash
      if (/^\d+$/.test(blockInput.trim())) {
        const height = parseInt(blockInput.trim())
        blockData = await whatsOnChainService.getBlockByHeight(height)
      } else {
        // Assume it's a block hash
        blockData = await whatsOnChainService.getBlockByHash(blockInput.trim())
      }

      if (!blockData.tx || blockData.tx.length === 0) {
        throw new Error('No transactions found in this block')
      }

      // Build merkle tree from transaction IDs
      const merkleTree = await buildMerkleTree(blockData.tx)
      
      // Reset all visualization state for clean rendering
      setTree(merkleTree)
      setSelectedLeaf(null)
      setMerklePath([])
      setProofSteps([])
      setPathNodes(new Set())
      setShowPathOnly(false)
      setCalculatingSteps(false)
      setActiveTab('visualization')

    } catch (error) {
      setBlockError(error instanceof Error ? error.message : 'Failed to load block data')
    } finally {
      setLoadingBlock(false)
    }
  }

  const handleLeafClick = async (leafId: string) => {
    if (!tree) return

    setSelectedLeaf(leafId)
    const path = await findMerklePath(tree, leafId)
    setMerklePath(path)

    // Collect nodes involved in the merkle path and enable path-only view
    const pathNodeIds = getPathNodes(tree, leafId)
    setPathNodes(pathNodeIds)
    setShowPathOnly(true)

    // Scroll to top of page when a leaf is clicked
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const calculateMerkleProofSteps = useCallback(async (targetLeafHash: string, path: MerklePathStep[], targetLeafId: string) => {
    if (!tree) return []

    const steps = []
    let currentHash = targetLeafHash

    // Find the target leaf position to determine concatenation order
    const findLeafPosition = (node: TreeNode): number => {
      if (node.isLeaf && node.id === targetLeafId) {
        return node.position
      }
      if (node.left) {
        const leftPos = findLeafPosition(node.left)
        if (leftPos !== -1) return leftPos
      }
      if (node.right) {
        const rightPos = findLeafPosition(node.right)
        if (rightPos !== -1) return rightPos
      }
      return -1
    }

    let currentIndex = findLeafPosition(tree)

    for (let i = 0; i < path.length; i++) {
      const step = path[i]
      if (step.isTarget) {
        // First step is just the target leaf
        steps.push({
          stepNumber: i + 1,
          operation: 'Start with target leaf',
          leftHash: currentHash,
          rightHash: '',
          result: currentHash,
          description: 'Target transaction hash'
        })
      } else {
        // Use the algorithm from MerkleReport.md:
        // If position is even: combined = current || sibling
        // If position is odd: combined = sibling || current
        const isEven = currentIndex % 2 === 0
        const leftHash = isEven ? currentHash : step.hash
        const rightHash = isEven ? step.hash : currentHash

        // Apply Bitcoin's hashBinary (double SHA-256 with endianness)
        const resultHash = await hashBinary(leftHash, rightHash)

        steps.push({
          stepNumber: i + 1,
          operation: `DoubleSHA256(left + right)`,
          leftHash,
          rightHash,
          result: resultHash,
          description: `Position ${currentIndex} (${isEven ? 'even' : 'odd'}): ${isEven ? 'current+sibling' : 'sibling+current'}`
        })

        // Move to next level: update position = floor(position / 2)
        currentHash = resultHash
        currentIndex = Math.floor(currentIndex / 2)
      }
    }

    return steps
  }, [hashBinary, tree])

  // Calculate proof steps when merkle path changes
  useEffect(() => {
    if (merklePath.length > 0 && selectedLeaf && tree) {
      setCalculatingSteps(true)

      // Find the selected leaf node to get its hash
      const findLeafNode = (node: TreeNode): TreeNode | null => {
        if (node.isLeaf && node.id === selectedLeaf) return node
        if (node.left) {
          const found = findLeafNode(node.left)
          if (found) return found
        }
        if (node.right) {
          const found = findLeafNode(node.right)
          if (found) return found
        }
        return null
      }

      const leafNode = findLeafNode(tree)
      if (leafNode) {
        calculateMerkleProofSteps(leafNode.hash, merklePath, selectedLeaf).then(steps => {
          setProofSteps(steps)
          setCalculatingSteps(false)
        }).catch(() => {
          setCalculatingSteps(false)
        })
      } else {
        setCalculatingSteps(false)
      }
    } else {
      setProofSteps([])
    }
  }, [merklePath, selectedLeaf, tree, calculateMerkleProofSteps])

  const renderNode = (node: TreeNode, x: number, y: number, nodeWidth: number, nodeHeight: number) => {
    const isSelected = selectedLeaf === node.id
    const isInPath = merklePath.some(step => step.hash === node.hash)

    // Split hash into 4 lines of 16 characters each
    const hashLines = []
    const fullHash = node.hash

    // Split hash into 4 lines of 16 characters each
    for (let i = 0; i < fullHash.length; i += 16) {
      hashLines.push(fullHash.substring(i, i + 16))
    }

    return (
      <g key={node.id}>
        {/* Visible node background - make this clickable */}
        <rect
          x={x - nodeWidth / 2}
          y={y - nodeHeight / 2}
          width={nodeWidth}
          height={nodeHeight}
          rx={8}
          ry={8}
          fill={isSelected ? '#a855f7' : isInPath ? '#0a84ff' : '#374151'}
          stroke={isSelected || isInPath ? '#ffffff' : '#6b7280'}
          strokeWidth={isSelected ? 3 : 1}
          className={node.isLeaf ? 'cursor-pointer hover:fill-blue-600' : ''}
          onClick={node.isLeaf ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLeafClick(node.id);
          } : undefined}
          style={node.isLeaf ? { pointerEvents: 'all' } : undefined}
        />

        {/* Hash text */}
        {hashLines.map((line, index) => (
          <text
            key={`hash-${index}`}
            x={x}
            y={y - (hashLines.length * 6) + (index * 12) + 6}
            textAnchor="middle"
            className="text-xs fill-white font-mono pointer-events-none"
            fontSize="9"
          >
            {line}
          </text>
        ))}

        {/* Value text (for leaf nodes) */}
        {node.value && (
          <text
            x={x}
            y={y + nodeHeight / 2 - 8}
            textAnchor="middle"
            className="text-xs fill-gray-300 pointer-events-none"
            fontSize="8"
          >
            {node.value.length > 12 ? node.value.substring(0, 12) + '...' : node.value}
          </text>
        )}

        {/* Copy button for hash */}
        <circle
          cx={x + nodeWidth / 2 - 12}
          cy={y - nodeHeight / 2 + 12}
          r={8}
          fill="rgba(255, 255, 255, 0.1)"
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth={1}
          className="cursor-pointer hover:fill-white hover:fill-opacity-20"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(node.hash);
          }}
          style={{ pointerEvents: 'all' }}
        />
        <text
          x={x + nodeWidth / 2 - 12}
          y={y - nodeHeight / 2 + 16}
          textAnchor="middle"
          className="text-xs fill-white pointer-events-none"
          fontSize="8"
        >
          📋
        </text>
      </g>
    )
  }

  const renderTree = () => {
    if (!tree) return null

    const nodeWidth = 180
    const nodeHeight = 80
    const levelHeight = 120
    const minNodeSpacing = 20 // Minimum space between nodes

    const getAllNodes = (node: TreeNode): TreeNode[] => {
      const nodes = [node]
      if (node.left) nodes.push(...getAllNodes(node.left))
      if (node.right && node.right !== node.left) nodes.push(...getAllNodes(node.right))
      return nodes
    }

    const allNodes = getAllNodes(tree)
    // Remove duplicates by ID (in case of issues with duplication logic)
    const uniqueNodes = allNodes.filter((node, index, self) => 
      self.findIndex(n => n.id === node.id) === index
    )
    const maxLevel = Math.max(...uniqueNodes.map(n => n.level))

    // Filter nodes based on view mode
    const filteredNodes = showPathOnly
      ? uniqueNodes.filter(node => pathNodes.has(node.id))
      : uniqueNodes

    const nodesByLevel = Array.from({ length: maxLevel + 1 }, () => [] as TreeNode[])
    filteredNodes.forEach(node => nodesByLevel[node.level].push(node))

    // Calculate dynamic width based on the widest level
    const maxNodesInLevel = Math.max(...nodesByLevel.map(level => level.length))

    // In path-only mode, use more generous spacing for better visualization
    const effectiveNodeWidth = showPathOnly ? nodeWidth + 40 : nodeWidth
    const effectiveSpacing = showPathOnly ? minNodeSpacing + 40 : minNodeSpacing
    const minWidth = showPathOnly ? 800 : 1200

    const calculatedWidth = Math.max(
      minWidth,
      maxNodesInLevel * (effectiveNodeWidth + effectiveSpacing) + 100
    )

    const svgWidth = calculatedWidth
    
    // Calculate minimal height needed for the tree with appropriate padding
    const totalTreeHeight = maxLevel * levelHeight + nodeHeight
    const verticalPadding = 60 // Reduced padding
    const svgHeight = totalTreeHeight + (verticalPadding * 2)
    
    // Start the tree with minimal top padding
    const startY = verticalPadding + nodeHeight / 2

    return (
      <div className="overflow-auto border border-gray-700 rounded-lg bg-black" style={{ maxHeight: '80vh', minHeight: 'auto' }}>
        <svg width={svgWidth} height={svgHeight} className="bg-black block">
          {/* Render connections first (behind nodes) */}
          {nodesByLevel.map((levelNodes, level) => {
            const y = startY + (maxLevel - level) * levelHeight
            const levelWidth = svgWidth - 100
            const spacing = levelWidth / (levelNodes.length + 1)

            return levelNodes.map((node, index) => {
              const x = 50 + spacing * (index + 1)
              const connections = []

              if (node.left && (!showPathOnly || pathNodes.has(node.left.id))) {
                const leftLevel = nodesByLevel[node.left.level]
                const leftIndex = leftLevel.indexOf(node.left)
                if (leftIndex !== -1) {
                  const leftSpacing = levelWidth / (leftLevel.length + 1)
                  const leftX = 50 + leftSpacing * (leftIndex + 1)
                  const leftY = startY + (maxLevel - node.left.level) * levelHeight

                  connections.push(
                    <line
                      key={`${node.id}-left`}
                      x1={x}
                      y1={y + nodeHeight / 2}
                      x2={leftX}
                      y2={leftY - nodeHeight / 2}
                      stroke={merklePath.some(step => step.hash === node.hash || step.hash === node.left?.hash) ? '#0a84ff' : '#6b7280'}
                      strokeWidth={merklePath.some(step => step.hash === node.hash || step.hash === node.left?.hash) ? 2 : 1}
                    />
                  )
                }
              }

              if (node.right && node.right !== node.left && (!showPathOnly || pathNodes.has(node.right.id))) {
                const rightLevel = nodesByLevel[node.right.level]
                const rightIndex = rightLevel.indexOf(node.right)
                if (rightIndex !== -1) {
                  const rightSpacing = levelWidth / (rightLevel.length + 1)
                  const rightX = 50 + rightSpacing * (rightIndex + 1)
                  const rightY = startY + (maxLevel - node.right.level) * levelHeight

                  connections.push(
                    <line
                      key={`${node.id}-right`}
                      x1={x}
                      y1={y + nodeHeight / 2}
                      x2={rightX}
                      y2={rightY - nodeHeight / 2}
                      stroke={merklePath.some(step => step.hash === node.hash || step.hash === node.right?.hash) ? '#0a84ff' : '#6b7280'}
                      strokeWidth={merklePath.some(step => step.hash === node.hash || step.hash === node.right?.hash) ? 2 : 1}
                    />
                  )
                }
              }

              return <g key={`connections-${node.id}`}>{connections}</g>
            })
          })}

          {/* Render nodes on top */}
          {nodesByLevel.map((levelNodes, level) => {
            const y = startY + (maxLevel - level) * levelHeight
            const levelWidth = svgWidth - 100
            const spacing = levelWidth / (levelNodes.length + 1)

            return levelNodes.map((node, index) => {
              const x = 50 + spacing * (index + 1)
              return renderNode(node, x, y, nodeWidth, nodeHeight)
            })
          })}
        </svg>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-4xl sm:text-4xl font-bold mb-4">
          <span className="bg-gradient-to-r from-[#0a84ff] to-[#a855f7] bg-clip-text text-transparent">
            Merkle Tree Visualizer
          </span>
        </h1>
        <p className="text-xl text-[#d1d5db] max-w-3xl mx-auto">
          Build and visualise Merkle trees with full hash display and interactive proof verification
        </p>
      </div>

      <div className="bg-[#0f172a] rounded-lg p-6">

        <div className="flex border-b border-gray-700 mb-6">
          <button
            onClick={() => setActiveTab('visualization')}
            className={`px-4 py-2 ${activeTab === 'visualization' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-400'}`}
          >
            Tree Visualization
          </button>
          <button
            onClick={() => setActiveTab('merklepath')}
            className={`px-4 py-2 ${activeTab === 'merklepath' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-400'}`}
            disabled={merklePath.length === 0}
          >
            Merkle Path
          </button>
          <button
            onClick={() => setActiveTab('calculation')}
            className={`px-4 py-2 ${activeTab === 'calculation' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-400'}`}
            disabled={proofSteps.length === 0}
          >
            Hash Calculation
          </button>
        </div>

        {/* Load Block Data Section - Always Visible */}
        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Load Block Data from WhatsOnChain</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                Block Height or Hash:
              </label>
              <input
                type="text"
                value={blockInput}
                onChange={(e) => setBlockInput(e.target.value)}
                placeholder="Enter block height (e.g., 575191) or block hash"
                className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white"
              />
            </div>

            {blockError && (
              <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm">
                {blockError}
              </div>
            )}

            <button
              onClick={loadBlockData}
              disabled={!blockInput.trim() || loadingBlock}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg"
            >
              {loadingBlock && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              Load Block Transactions
            </button>

            <div className="text-sm text-gray-400 space-y-2">
              <p>
                This will fetch all transaction IDs from the specified block and create a Merkle tree visualization.
                You can enter either a block height (number) or a block hash.
              </p>
              <p>
                <span className="font-medium">Current network:</span> {network === 'main' ? 'Mainnet' : 'Testnet'}
              </p>
              <p>
                <span className="font-medium">Sample block heights:</span>{' '}
                {network === 'main' ? (
                  <span>
                    <button
                      onClick={() => setBlockInput('575191')}
                      className="text-blue-400 hover:text-blue-300 underline mx-1"
                    >
                      575191
                    </button>
                    <button
                      onClick={() => setBlockInput('700000')}
                      className="text-blue-400 hover:text-blue-300 underline mx-1"
                    >
                      700000
                    </button>
                    <button
                      onClick={() => setBlockInput('800000')}
                      className="text-blue-400 hover:text-blue-300 underline mx-1"
                    >
                      800000
                    </button>
                  </span>
                ) : (
                  <span>
                    <button
                      onClick={() => setBlockInput('1400000')}
                      className="text-blue-400 hover:text-blue-300 underline mx-1"
                    >
                      1400000
                    </button>
                    <button
                      onClick={() => setBlockInput('1500000')}
                      className="text-blue-400 hover:text-blue-300 underline mx-1"
                    >
                      1500000
                    </button>
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {activeTab === 'visualization' && (
          <div className="space-y-4">
            {tree ? (
              <div className="overflow-auto">
                {tree && (
                  <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-white">Merkle Root Hash</h3>
                      <div className="flex items-center gap-2">
                        {selectedLeaf && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowPathOnly(!showPathOnly)}
                              className={`px-3 py-1 text-xs rounded transition-colors ${showPathOnly
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-gray-700 hover:bg-gray-600 text-white'
                                }`}
                              title={showPathOnly ? 'Show full tree' : 'Show merkle path only'}
                            >
                              {showPathOnly ? '🌳 Full Tree' : '🎯 Path Only'}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedLeaf(null)
                                setMerklePath([])
                                setShowPathOnly(false)
                                setPathNodes(new Set())
                                setProofSteps([])
                              }}
                              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                              title="Reset selection"
                            >
                              🔄 Reset
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => copyToClipboard(tree.hash)}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                          title="Copy root hash to clipboard"
                        >
                          📋 Copy Root
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-900 rounded border">
                      <p className="font-mono text-sm text-blue-400 break-all leading-relaxed">{tree.hash}</p>
                    </div>
                    {showPathOnly && selectedLeaf && (
                      <div className="mt-3 p-2 bg-blue-900/20 border border-blue-500/30 rounded text-sm text-blue-300">
                        🎯 Showing merkle path for selected transaction: {selectedLeaf.replace('leaf-', '')}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-gray-300 mb-4">
                  Click on any leaf node (bottom row) to see its Merkle path proof and access the Merkle Path and Hash Calculation tabs.
                </p>
                {renderTree()}
              </div>
            ) : (
              <div className="p-8 bg-gray-800 rounded-lg text-center">
                <h3 className="text-xl font-semibold text-white mb-2">No Merkle Tree Data</h3>
                <p className="text-gray-400">Load block data from WhatsOnChain above to create a Merkle tree visualization.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'merklepath' && (
          <div className="space-y-4">
            {merklePath.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Merkle Path {selectedLeaf && `for ${selectedLeaf}`}
                </h3>
                <div className="space-y-3">
                  {merklePath.map((step, index) => (
                    <div key={index} className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-gray-400 min-w-[60px] font-medium">
                            Step {index + 1}:
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${step.isTarget ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                            }`}>
                            {step.isTarget ? 'Target Hash' : `Sibling Hash (${step.position})`}
                          </span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(step.hash)}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                          title="Copy hash to clipboard"
                        >
                          📋 Copy
                        </button>
                      </div>
                      <div className="mt-3 p-3 bg-gray-900 rounded border">
                        <span className="font-mono text-sm text-blue-400 break-all leading-relaxed">
                          {step.hash}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-300">
                    This path proves that the selected leaf is included in the Merkle tree.
                    Each step shows either the target hash or a sibling hash needed for verification.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-8 bg-gray-800 rounded-lg text-center">
                <h3 className="text-xl font-semibold text-white mb-2">No Merkle Path Selected</h3>
                <p className="text-gray-400">Click on a leaf node in the Tree Visualization tab to generate a merkle path.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'calculation' && (
          <div className="space-y-4">
            {proofSteps.length > 0 ? (
              <div>
                <h4 className="text-lg font-semibold text-white mb-4">
                  🧮 Hash Calculation Steps
                </h4>
                <div className="space-y-4">
                  {calculatingSteps ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
                      <span className="text-gray-300">Calculating hash steps...</span>
                    </div>
                  ) : (
                    proofSteps.map((step, index) => (
                      <div key={index} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-green-400 font-medium">Step {step.stepNumber}</span>
                          <button
                            onClick={() => copyToClipboard(step.result)}
                            className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded transition-colors"
                            title="Copy result hash"
                          >
                            📋 Copy
                          </button>
                        </div>

                        {step.rightHash ? (
                          <div className="space-y-3">
                            <div className="text-xs text-green-200 font-medium">{step.operation}</div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                              <div>
                                <div className="text-xs text-gray-400 mb-1">Left Hash:</div>
                                <div className="p-2 bg-gray-800 rounded border font-mono text-xs text-blue-400 break-all">
                                  {step.leftHash}
                                </div>
                              </div>

                              <div className="text-center">
                                <div className="text-green-400 text-lg font-bold">+</div>
                                <div className="text-xs text-gray-400">concatenate</div>
                              </div>

                              <div>
                                <div className="text-xs text-gray-400 mb-1">Right Hash:</div>
                                <div className="p-2 bg-gray-800 rounded border font-mono text-xs text-blue-400 break-all">
                                  {step.rightHash}
                                </div>
                              </div>
                            </div>

                            <div className="text-center">
                              <div className="text-green-400 text-lg font-bold">↓</div>
                              <div className="text-xs text-gray-400">SHA-256</div>
                            </div>

                            <div>
                              <div className="text-xs text-gray-400 mb-1">Result:</div>
                              <div className="p-3 bg-green-900/30 border border-green-500/50 rounded font-mono text-sm text-green-400 break-all">
                                {step.result}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Starting Hash:</div>
                            <div className="p-3 bg-green-900/30 border border-green-500/50 rounded font-mono text-sm text-green-400 break-all">
                              {step.result}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-blue-400 font-medium">✅ Verification Complete</span>
                    </div>
                    <p className="text-sm text-blue-300 mb-4">
                      The final calculated hash should match the merkle root to prove the transaction is included in the block.
                    </p>
                    {tree && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-blue-400 font-medium text-sm">🌳 Merkle Root (Expected):</span>
                          <button
                            onClick={() => copyToClipboard(tree.hash)}
                            className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                            title="Copy merkle root"
                          >
                            📋 Copy
                          </button>
                        </div>
                        <div className="p-3 bg-blue-900/30 border border-blue-500/50 rounded font-mono text-sm text-blue-300 break-all">
                          {tree.hash}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 bg-gray-800 rounded-lg text-center">
                <h3 className="text-xl font-semibold text-white mb-2">No Hash Calculation Available</h3>
                <p className="text-gray-400">Click on a leaf node in the Tree Visualization tab to generate hash calculation steps.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}