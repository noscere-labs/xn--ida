import React, { useState, useCallback } from 'react';
import { Upload, FileText, Hash, Activity, ChevronDown, ChevronRight, Copy, CheckCircle, AlertCircle } from 'lucide-react';

// Mock BSV SDK functions - in real implementation, you'd import from @bsv/sdk
const mockBSVSDK = {
  // Helper to convert hex to bytes
  hexToBytes: (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  },
  
  // Helper to read variable integer
  readVarInt: (data: Uint8Array, offset: number): { value: number; nextOffset: number } => {
    const first = data[offset];
    if (first < 0xfd) {
      return { value: first, nextOffset: offset + 1 };
    } else if (first === 0xfd) {
      const value = data[offset + 1] | (data[offset + 2] << 8);
      return { value, nextOffset: offset + 3 };
    } else if (first === 0xfe) {
      const value = data[offset + 1] | (data[offset + 2] << 8) | (data[offset + 3] << 16) | (data[offset + 4] << 24);
      return { value, nextOffset: offset + 5 };
    } else {
      // 0xff - 8 bytes (simplified for demo)
      let value = 0;
      for (let i = 1; i <= 8; i++) {
        value += data[offset + i] * Math.pow(256, i - 1);
      }
      return { value, nextOffset: offset + 9 };
    }
  },
  
  // Helper to calculate double SHA256
  doubleSha256: (data: Uint8Array): string => {
    // Mock implementation - in real app use crypto libraries
    return Array.from(data.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
};

interface BumpData {
  blockHeight: number;
  treeHeight: number;
  paths: Array<{
    offset: number;
    flags: number;
    hash?: string;
    isDuplicate: boolean;
    isClientTxid: boolean;
  }[]>;
}

interface ParsedTransaction {
  rawHex: string;
  txid: string;
  version: number;
  inputs: Array<{
    prevTxHash: string;
    prevTxIndex: number;
    scriptLength: number;
    script: string;
    sequence: number;
  }>;
  outputs: Array<{
    value: number;
    scriptLength: number;
    script: string;
  }>;
  locktime: number;
  hasBump: boolean;
  bumpIndex?: number;
}

interface ParsedBEEF {
  version: number;
  versionHex: string;
  isValidVersion: boolean;
  bumps: BumpData[];
  transactions: ParsedTransaction[];
  totalSize: number;
  raw: string;
}

const BEEFParser: React.FC = () => {
  const [beefData, setBeefData] = useState<string>('');
  const [parsedBEEF, setParsedBEEF] = useState<ParsedBEEF | null>(null);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'bumps' | 'transactions'>('overview');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const parseBUMP = (data: Uint8Array, offset: number): { bump: BumpData; nextOffset: number } => {
    let currentOffset = offset;
    
    // Read block height
    const blockHeightResult = mockBSVSDK.readVarInt(data, currentOffset);
    const blockHeight = blockHeightResult.value;
    currentOffset = blockHeightResult.nextOffset;
    
    // Read tree height
    const treeHeight = data[currentOffset];
    currentOffset++;
    
    const paths: Array<{
      offset: number;
      flags: number;
      hash?: string;
      isDuplicate: boolean;
      isClientTxid: boolean;
    }[]> = [];
    
    // Parse each level of the tree
    for (let level = 0; level < treeHeight; level++) {
      const nLeavesResult = mockBSVSDK.readVarInt(data, currentOffset);
      const nLeaves = nLeavesResult.value;
      currentOffset = nLeavesResult.nextOffset;
      
      const levelPaths: typeof paths[0] = [];
      
      for (let i = 0; i < nLeaves; i++) {
        const offsetResult = mockBSVSDK.readVarInt(data, currentOffset);
        const leafOffset = offsetResult.value;
        currentOffset = offsetResult.nextOffset;
        
        const flags = data[currentOffset];
        currentOffset++;
        
        const isDuplicate = (flags & 1) !== 0;
        const isClientTxid = (flags & 2) !== 0;
        
        let hash: string | undefined;
        if (!isDuplicate) {
          hash = Array.from(data.slice(currentOffset, currentOffset + 32).reverse())
            .map(b => b.toString(16).padStart(2, '0')).join('');
          currentOffset += 32;
        }
        
        levelPaths.push({
          offset: leafOffset,
          flags,
          hash,
          isDuplicate,
          isClientTxid
        });
      }
      
      paths.push(levelPaths);
    }
    
    return {
      bump: { blockHeight, treeHeight, paths },
      nextOffset: currentOffset
    };
  };

  const parseTransaction = (data: Uint8Array, offset: number): { tx: Omit<ParsedTransaction, 'hasBump' | 'bumpIndex'>; nextOffset: number } => {
    const startOffset = offset;
    let currentOffset = offset;
    
    // Version (4 bytes, little endian)
    const version = data[currentOffset] | (data[currentOffset + 1] << 8) | 
                   (data[currentOffset + 2] << 16) | (data[currentOffset + 3] << 24);
    currentOffset += 4;
    
    // Input count
    const inputCountResult = mockBSVSDK.readVarInt(data, currentOffset);
    const inputCount = inputCountResult.value;
    currentOffset = inputCountResult.nextOffset;
    
    const inputs: ParsedTransaction['inputs'] = [];
    
    // Parse inputs
    for (let i = 0; i < inputCount; i++) {
      // Previous tx hash (32 bytes, little endian)
      const prevTxHash = Array.from(data.slice(currentOffset, currentOffset + 32).reverse())
        .map(b => b.toString(16).padStart(2, '0')).join('');
      currentOffset += 32;
      
      // Previous tx index (4 bytes, little endian)
      const prevTxIndex = data[currentOffset] | (data[currentOffset + 1] << 8) | 
                         (data[currentOffset + 2] << 16) | (data[currentOffset + 3] << 24);
      currentOffset += 4;
      
      // Script length
      const scriptLengthResult = mockBSVSDK.readVarInt(data, currentOffset);
      const scriptLength = scriptLengthResult.value;
      currentOffset = scriptLengthResult.nextOffset;
      
      // Script
      const script = Array.from(data.slice(currentOffset, currentOffset + scriptLength))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      currentOffset += scriptLength;
      
      // Sequence (4 bytes)
      const sequence = data[currentOffset] | (data[currentOffset + 1] << 8) | 
                      (data[currentOffset + 2] << 16) | (data[currentOffset + 3] << 24);
      currentOffset += 4;
      
      inputs.push({ prevTxHash, prevTxIndex, scriptLength, script, sequence });
    }
    
    // Output count
    const outputCountResult = mockBSVSDK.readVarInt(data, currentOffset);
    const outputCount = outputCountResult.value;
    currentOffset = outputCountResult.nextOffset;
    
    const outputs: ParsedTransaction['outputs'] = [];
    
    // Parse outputs
    for (let i = 0; i < outputCount; i++) {
      // Value (8 bytes, little endian)
      let value = 0;
      for (let j = 0; j < 8; j++) {
        value += data[currentOffset + j] * Math.pow(256, j);
      }
      currentOffset += 8;
      
      // Script length
      const scriptLengthResult = mockBSVSDK.readVarInt(data, currentOffset);
      const scriptLength = scriptLengthResult.value;
      currentOffset = scriptLengthResult.nextOffset;
      
      // Script
      const script = Array.from(data.slice(currentOffset, currentOffset + scriptLength))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      currentOffset += scriptLength;
      
      outputs.push({ value, scriptLength, script });
    }
    
    // Locktime (4 bytes)
    const locktime = data[currentOffset] | (data[currentOffset + 1] << 8) | 
                    (data[currentOffset + 2] << 16) | (data[currentOffset + 3] << 24);
    currentOffset += 4;
    
    const rawHex = Array.from(data.slice(startOffset, currentOffset))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const txid = mockBSVSDK.doubleSha256(data.slice(startOffset, currentOffset));
    
    return {
      tx: { rawHex, txid, version, inputs, outputs, locktime },
      nextOffset: currentOffset
    };
  };

  const parseBEEF = useCallback((hexData: string): ParsedBEEF => {
    try {
      const data = mockBSVSDK.hexToBytes(hexData.replace(/\s/g, ''));
      let offset = 0;
      
      // Parse version (4 bytes, little endian)
      const version = data[offset] | (data[offset + 1] << 8) | 
                     (data[offset + 2] << 16) | (data[offset + 3] << 24);
      const versionHex = Array.from(data.slice(offset, offset + 4))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const isValidVersion = version === 4022206465; // 0100BEEF
      offset += 4;
      
      // Parse number of BUMPs
      const nBumpsResult = mockBSVSDK.readVarInt(data, offset);
      const nBumps = nBumpsResult.value;
      offset = nBumpsResult.nextOffset;
      
      // Parse BUMPs
      const bumps: BumpData[] = [];
      for (let i = 0; i < nBumps; i++) {
        const bumpResult = parseBUMP(data, offset);
        bumps.push(bumpResult.bump);
        offset = bumpResult.nextOffset;
      }
      
      // Parse number of transactions
      const nTransactionsResult = mockBSVSDK.readVarInt(data, offset);
      const nTransactions = nTransactionsResult.value;
      offset = nTransactionsResult.nextOffset;
      
      // Parse transactions
      const transactions: ParsedTransaction[] = [];
      for (let i = 0; i < nTransactions; i++) {
        const txResult = parseTransaction(data, offset);
        offset = txResult.nextOffset;
        
        // Check if transaction has BUMP
        const hasBumpFlag = data[offset];
        offset++;
        
        let bumpIndex: number | undefined;
        if (hasBumpFlag === 1) {
          const bumpIndexResult = mockBSVSDK.readVarInt(data, offset);
          bumpIndex = bumpIndexResult.value;
          offset = bumpIndexResult.nextOffset;
        }
        
        transactions.push({
          ...txResult.tx,
          hasBump: hasBumpFlag === 1,
          bumpIndex
        });
      }
      
      return {
        version,
        versionHex,
        isValidVersion,
        bumps,
        transactions,
        totalSize: data.length,
        raw: hexData
      };
    } catch (err) {
      throw new Error(`Failed to parse BEEF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  const handleParseBEEF = () => {
    try {
      setError('');
      const parsed = parseBEEF(beefData);
      setParsedBEEF(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown parsing error');
      setParsedBEEF(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatSatoshis = (satoshis: number): string => {
    return `${satoshis.toLocaleString()} sat (${(satoshis / 100000000).toFixed(8)} BSV)`;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-800">BEEF Transaction Parser</h1>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            BEEF Transaction Hex Data
          </label>
          <textarea
            value={beefData}
            onChange={(e) => setBeefData(e.target.value)}
            placeholder="Paste your BEEF transaction hex data here..."
            className="w-full h-32 p-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleParseBEEF}
              disabled={!beefData.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Hash className="w-4 h-4" />
              Parse BEEF
            </button>
            <button
              onClick={() => {
                // Sample BEEF data for demo
                const sampleBEEF = "0100beef01fe636d0c0007021400fe507c0c7aa754cef1f7889d5fd395cf1f785dd7de98eed895dbedfe4e5bc70d1502ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e010b00bc4ff395efd11719b277694cface5aa50d085a0bb81f613f70313acd28cf4557010400574b2d9142b8d28b61d88e3b2c3f44d858411356b49a28a4643b6d1a6a092a5201030051a05fc84d531b5d250c23f4f886f6812f9fe3f402d61607f977b4ecd2701c19010000fd781529d58fc2523cf396a7f25440b409857e7e221766c57214b1d38c7b481f01010062f542f45ea3660f86c013ced80534cb5fd4c19d66c56e7e8c5d4bf2d40acc5e010100b121e91836fd7cd5102b654e9f72f3cf6fdbfd0b161c53a9c54b12c841126331020100000001cd4e4cac3c7b56920d1e7655e7e260d31f29d9a388d04910f1bbd72304a79029010000006b483045022100e75279a205a547c445719420aa3138bf14743e3f42618e5f86a19bde14bb95f7022064777d34776b05d816daf1699493fcdf2ef5a5ab1ad710d9c97bfb5b8f7cef3641210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013e660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000001000100000001ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e000000006a47304402203a61a2e931612b4bda08d541cfb980885173b8dcf64a3471238ae7abcd368d6402204cbf24f04b9aa2256d8901f0ed97866603d2be8324c2bfb7a37bf8fc90edd5b441210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013c660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000000";
                setBeefData(sampleBEEF);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Load Sample
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-red-700">{error}</span>
          </div>
        )}
      </div>

      {parsedBEEF && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex">
              {[
                { id: 'overview', label: 'Overview', icon: Activity },
                { id: 'bumps', label: 'BUMP Data', icon: Hash },
                { id: 'transactions', label: 'Transactions', icon: FileText }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as typeof activeTab)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                    activeTab === id
                      ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className={`w-5 h-5 ${parsedBEEF.isValidVersion ? 'text-green-500' : 'text-red-500'}`} />
                      <span className="font-medium">Version</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <div>Hex: {parsedBEEF.versionHex}</div>
                      <div>Decimal: {parsedBEEF.version}</div>
                      <div className={parsedBEEF.isValidVersion ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {parsedBEEF.isValidVersion ? '✓ Valid BEEF' : '✗ Invalid Version'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="font-medium mb-2">BUMP Proofs</div>
                    <div className="text-2xl font-bold text-green-600">{parsedBEEF.bumps.length}</div>
                    <div className="text-sm text-gray-600">Merkle proofs included</div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="font-medium mb-2">Transactions</div>
                    <div className="text-2xl font-bold text-purple-600">{parsedBEEF.transactions.length}</div>
                    <div className="text-sm text-gray-600">
                      {parsedBEEF.transactions.filter(tx => tx.hasBump).length} with proofs
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Raw BEEF Data</span>
                    <button
                      onClick={() => copyToClipboard(parsedBEEF.raw)}
                      className="flex items-center gap-1 px-2 py-1 text-sm bg-white border rounded hover:bg-gray-50"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                  </div>
                  <div className="font-mono text-xs text-gray-600 break-all bg-white p-3 rounded border max-h-20 overflow-y-auto">
                    {parsedBEEF.raw}
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    Total size: {parsedBEEF.totalSize.toLocaleString()} bytes
                  </div>
                </div>
              </div>
            )}

            {/* BUMPS Tab */}
            {activeTab === 'bumps' && (
              <div className="space-y-4">
                {parsedBEEF.bumps.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No BUMP data found in this BEEF transaction.
                  </div>
                ) : (
                  parsedBEEF.bumps.map((bump, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleSection(`bump-${index}`)}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Hash className="w-5 h-5 text-blue-600" />
                          <span className="font-medium">BUMP {index + 1}</span>
                          <span className="text-sm text-gray-600">
                            Block: {bump.blockHeight}, Tree Height: {bump.treeHeight}
                          </span>
                        </div>
                        {expandedSections.has(`bump-${index}`) ? 
                          <ChevronDown className="w-5 h-5" /> : 
                          <ChevronRight className="w-5 h-5" />
                        }
                      </button>
                      
                      {expandedSections.has(`bump-${index}`) && (
                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Block Height:</span> {bump.blockHeight}
                            </div>
                            <div>
                              <span className="font-medium">Tree Height:</span> {bump.treeHeight}
                            </div>
                          </div>
                          
                          <div>
                            <h4 className="font-medium mb-2">Merkle Path Levels</h4>
                            <div className="space-y-2">
                              {bump.paths.map((level, levelIndex) => (
                                <div key={levelIndex} className="border border-gray-100 rounded p-3">
                                  <div className="font-medium text-sm mb-2">Level {levelIndex} ({level.length} leaves)</div>
                                  <div className="grid gap-2">
                                    {level.map((leaf, leafIndex) => (
                                      <div key={leafIndex} className="flex items-center gap-2 text-xs">
                                        <span className="w-12 text-gray-500">#{leaf.offset}</span>
                                        <span className={`px-2 py-1 rounded text-xs ${
                                          leaf.isClientTxid ? 'bg-blue-100 text-blue-800' :
                                          leaf.isDuplicate ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-gray-100 text-gray-800'
                                        }`}>
                                          {leaf.isClientTxid ? 'Client TXID' :
                                           leaf.isDuplicate ? 'Duplicate' : 'Sibling'}
                                        </span>
                                        {leaf.hash && (
                                          <span className="font-mono text-gray-600 truncate">
                                            {leaf.hash.substring(0, 16)}...
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Transactions Tab */}
            {activeTab === 'transactions' && (
              <div className="space-y-4">
                {parsedBEEF.transactions.map((tx, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection(`tx-${index}`)}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-green-600" />
                        <span className="font-medium">Transaction {index + 1}</span>
                        <span className="text-sm text-gray-600 font-mono">{tx.txid.substring(0, 16)}...</span>
                        {tx.hasBump && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                            Has Proof
                          </span>
                        )}
                      </div>
                      {expandedSections.has(`tx-${index}`) ? 
                        <ChevronDown className="w-5 h-5" /> : 
                        <ChevronRight className="w-5 h-5" />
                      }
                    </button>
                    
                    {expandedSections.has(`tx-${index}`) && (
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Transaction ID:</span>
                            <div className="font-mono text-xs bg-gray-100 p-2 rounded mt-1 break-all">
                              {tx.txid}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div><span className="font-medium">Version:</span> {tx.version}</div>
                            <div><span className="font-medium">Locktime:</span> {tx.locktime}</div>
                            {tx.hasBump && (
                              <div><span className="font-medium">BUMP Index:</span> {tx.bumpIndex}</div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium mb-2">Inputs ({tx.inputs.length})</h4>
                            <div className="space-y-2">
                              {tx.inputs.map((input, inputIndex) => (
                                <div key={inputIndex} className="bg-red-50 p-3 rounded text-xs">
                                  <div className="font-medium mb-1">Input #{inputIndex}</div>
                                  <div className="space-y-1">
                                    <div><span className="font-medium">Prev TX:</span> {input.prevTxHash.substring(0, 16)}...</div>
                                    <div><span className="font-medium">Output:</span> {input.prevTxIndex}</div>
                                    <div><span className="font-medium">Script:</span> {input.scriptLength} bytes</div>
                                    <div><span className="font-medium">Sequence:</span> {input.sequence}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h4 className="font-medium mb-2">Outputs ({tx.outputs.length})</h4>
                            <div className="space-y-2">
                              {tx.outputs.map((output, outputIndex) => (
                                <div key={outputIndex} className="bg-green-50 p-3 rounded text-xs">
                                  <div className="font-medium mb-1">Output #{outputIndex}</div>
                                  <div className="space-y-1">
                                    <div><span className="font-medium">Value:</span> {formatSatoshis(output.value)}</div>
                                    <div><span className="font-medium">Script:</span> {output.scriptLength} bytes</div>
                                    {output.script && (
                                      <div className="font-mono bg-white p-1 rounded break-all">
                                        {output.script.substring(0, 32)}...
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">Raw Transaction</span>
                            <button
                              onClick={() => copyToClipboard(tx.rawHex)}
                              className="flex items-center gap-1 px-2 py-1 text-sm bg-white border rounded hover:bg-gray-50"
                            >
                              <Copy className="w-3 h-3" />
                              Copy
                            </button>
                          </div>
                          <div className="font-mono text-xs text-gray-600 break-all bg-gray-100 p-3 rounded max-h-32 overflow-y-auto">
                            {tx.rawHex}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BEEFParser;