'use client';

import { useState, useCallback } from 'react';
import { Beef } from '@bsv/sdk';

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

export default function BEEFParser() {
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

  const parseBEEF = useCallback((hexData: string): ParsedBEEF => {
    try {
      const cleanHex = hexData.replace(/\s/g, '');
      const beef = Beef.fromString(cleanHex, 'hex');
      
      const bumps: BumpData[] = beef.bumps.map(bump => ({
        blockHeight: bump.blockHeight,
        treeHeight: bump.path.length,
        paths: bump.path.map(level => level.map(leaf => ({
          offset: leaf.offset,
          flags: 0,
          hash: leaf.hash,
          isDuplicate: leaf.duplicate || false,
          isClientTxid: leaf.txid || false
        })))
      }));

      const transactions: ParsedTransaction[] = beef.txs.map(beefTx => {
        const tx = beefTx.tx;
        if (!tx) {
          throw new Error('Transaction data not available');
        }

        const inputs = tx.inputs.map(input => ({
          prevTxHash: input.sourceTXID || '',
          prevTxIndex: input.sourceOutputIndex,
          scriptLength: input.unlockingScript?.toBinary().length || 0,
          script: input.unlockingScript?.toHex() || '',
          sequence: input.sequence || 0xFFFFFFFF
        }));

        const outputs = tx.outputs.map(output => ({
          value: output.satoshis || 0,
          scriptLength: output.lockingScript.toBinary().length,
          script: output.lockingScript.toHex()
        }));

        return {
          rawHex: tx.toHex(),
          txid: tx.id('hex'),
          version: tx.version,
          inputs,
          outputs,
          locktime: tx.lockTime,
          hasBump: beefTx.bumpIndex !== undefined,
          bumpIndex: beefTx.bumpIndex
        };
      });

      const binaryData = beef.toBinary();
      const version = beef.version;
      const versionHex = Array.from(binaryData.slice(0, 4))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const isValidVersion = version === 4022206465 || version === 4022206466;

      return {
        version,
        versionHex,
        isValidVersion,
        bumps,
        transactions,
        totalSize: binaryData.length,
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
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          <span className="bg-gradient-to-r from-[#0a84ff] to-[#a855f7] bg-clip-text text-transparent">
            BEEF Transaction
          </span>
          <br />
          <span className="bg-gradient-to-r from-[#0a84ff] to-[#a855f7] bg-clip-text text-transparent">
            Parser
          </span>
        </h1>
        <p className="text-xl text-[#d1d5db] max-w-2xl mx-auto">
          Parse and analyze BEEF (Bitcoin Extended Format) transactions
        </p>
      </div>

      <div className="bg-[#0f172a] rounded-lg p-6 mb-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-[#d1d5db] mb-2">
            BEEF Transaction Hex Data
          </label>
          <textarea
            value={beefData}
            onChange={(e) => setBeefData(e.target.value)}
            placeholder="Paste your BEEF transaction hex data here..."
            className="w-full h-32 p-3 bg-gray-800 border border-gray-700 rounded-lg font-mono text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-[#0a84ff] focus:border-transparent resize-none"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleParseBEEF}
              disabled={!beefData.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-[#0a84ff] text-white rounded-lg hover:bg-[#3ea6ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Parse BEEF
            </button>
            <button
              onClick={() => {
                const sampleBEEF = "0100beef01fe636d0c0007021400fe507c0c7aa754cef1f7889d5fd395cf1f785dd7de98eed895dbedfe4e5bc70d1502ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e010b00bc4ff395efd11719b277694cface5aa50d085a0bb81f613f70313acd28cf4557010400574b2d9142b8d28b61d88e3b2c3f44d858411356b49a28a4643b6d1a6a092a5201030051a05fc84d531b5d250c23f4f886f6812f9fe3f402d61607f977b4ecd2701c19010000fd781529d58fc2523cf396a7f25440b409857e7e221766c57214b1d38c7b481f01010062f542f45ea3660f86c013ced80534cb5fd4c19d66c56e7e8c5d4bf2d40acc5e010100b121e91836fd7cd5102b654e9f72f3cf6fdbfd0b161c53a9c54b12c841126331020100000001cd4e4cac3c7b56920d1e7655e7e260d31f29d9a388d04910f1bbd72304a79029010000006b483045022100e75279a205a547c445719420aa3138bf14743e3f42618e5f86a19bde14bb95f7022064777d34776b05d816daf1699493fcdf2ef5a5ab1ad710d9c97bfb5b8f7cef3641210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013e660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000001000100000001ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e000000006a47304402203a61a2e931612b4bda08d541cfb980885173b8dcf64a3471238ae7abcd368d6402204cbf24f04b9aa2256d8901f0ed97866603d2be8324c2bfb7a37bf8fc90edd5b441210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013c660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000000";
                setBeefData(sampleBEEF);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Load Sample
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg flex items-center gap-2">
            <span className="text-red-400">{error}</span>
          </div>
        )}
      </div>

      {parsedBEEF && (
        <div className="bg-[#0f172a] rounded-lg overflow-hidden">
          <div className="border-b border-gray-800">
            <nav className="flex">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'bumps', label: 'BUMP Data' },
                { id: 'transactions', label: 'Transactions' }
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as typeof activeTab)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                    activeTab === id
                      ? 'border-b-2 border-[#0a84ff] text-[#0a84ff] bg-[#0a84ff]/10'
                      : 'text-[#d1d5db] hover:text-white hover:bg-gray-800/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#0a84ff]/10 border border-[#0a84ff]/20 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-3 h-3 rounded-full ${parsedBEEF.isValidVersion ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-medium">Version</span>
                    </div>
                    <div className="text-sm text-[#d1d5db]">
                      <div>Hex: {parsedBEEF.versionHex}</div>
                      <div>Decimal: {parsedBEEF.version}</div>
                      <div className={parsedBEEF.isValidVersion ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                        {parsedBEEF.isValidVersion ? '✓ Valid BEEF' : '✗ Invalid Version'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg">
                    <div className="font-medium mb-2">BUMP Proofs</div>
                    <div className="text-2xl font-bold text-green-400">{parsedBEEF.bumps.length}</div>
                    <div className="text-sm text-[#d1d5db]">Merkle proofs included</div>
                  </div>
                  
                  <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-lg">
                    <div className="font-medium mb-2">Transactions</div>
                    <div className="text-2xl font-bold text-purple-400">{parsedBEEF.transactions.length}</div>
                    <div className="text-sm text-[#d1d5db]">
                      {parsedBEEF.transactions.filter(tx => tx.hasBump).length} with proofs
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Raw BEEF Data</span>
                    <button
                      onClick={() => copyToClipboard(parsedBEEF.raw)}
                      className="flex items-center gap-1 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="font-mono text-xs text-[#d1d5db] break-all bg-gray-900 p-3 rounded border max-h-20 overflow-y-auto">
                    {parsedBEEF.raw}
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    Total size: {parsedBEEF.totalSize.toLocaleString()} bytes
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bumps' && (
              <div className="space-y-4">
                {parsedBEEF.bumps.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    No BUMP data found in this BEEF transaction.
                  </div>
                ) : (
                  parsedBEEF.bumps.map((bump, index) => (
                    <div key={index} className="border border-gray-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleSection(`bump-${index}`)}
                        className="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">BUMP {index + 1}</span>
                          <span className="text-sm text-[#d1d5db]">
                            Block: {bump.blockHeight}, Tree Height: {bump.treeHeight}
                          </span>
                        </div>
                        <div className="text-[#0a84ff]">
                          {expandedSections.has(`bump-${index}`) ? '▼' : '▶'}
                        </div>
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
                                <div key={levelIndex} className="border border-gray-600 rounded p-3">
                                  <div className="font-medium text-sm mb-2">Level {levelIndex} ({level.length} leaves)</div>
                                  <div className="grid gap-2">
                                    {level.map((leaf, leafIndex) => (
                                      <div key={leafIndex} className="flex items-center gap-2 text-xs">
                                        <span className="w-12 text-gray-400">#{leaf.offset}</span>
                                        <span className={`px-2 py-1 rounded text-xs ${
                                          leaf.isClientTxid ? 'bg-[#0a84ff]/20 text-[#0a84ff]' :
                                          leaf.isDuplicate ? 'bg-yellow-500/20 text-yellow-400' :
                                          'bg-gray-700 text-gray-300'
                                        }`}>
                                          {leaf.isClientTxid ? 'Client TXID' :
                                           leaf.isDuplicate ? 'Duplicate' : 'Sibling'}
                                        </span>
                                        {leaf.hash && (
                                          <span className="font-mono text-gray-400 truncate">
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

            {activeTab === 'transactions' && (
              <div className="space-y-4">
                {parsedBEEF.transactions.map((tx, index) => (
                  <div key={index} className="border border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection(`tx-${index}`)}
                      className="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Transaction {index + 1}</span>
                        <span className="text-sm text-[#d1d5db] font-mono">{tx.txid.substring(0, 16)}...</span>
                        {tx.hasBump && (
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                            Has Proof
                          </span>
                        )}
                      </div>
                      <div className="text-[#0a84ff]">
                        {expandedSections.has(`tx-${index}`) ? '▼' : '▶'}
                      </div>
                    </button>
                    
                    {expandedSections.has(`tx-${index}`) && (
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Transaction ID:</span>
                            <div className="font-mono text-xs bg-gray-900 p-2 rounded mt-1 break-all">
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
                                <div key={inputIndex} className="bg-red-500/10 border border-red-500/20 p-3 rounded text-xs">
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
                                <div key={outputIndex} className="bg-green-500/10 border border-green-500/20 p-3 rounded text-xs">
                                  <div className="font-medium mb-1">Output #{outputIndex}</div>
                                  <div className="space-y-1">
                                    <div><span className="font-medium">Value:</span> {formatSatoshis(output.value)}</div>
                                    <div><span className="font-medium">Script:</span> {output.scriptLength} bytes</div>
                                    {output.script && (
                                      <div className="font-mono bg-gray-900 p-1 rounded break-all">
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
                              className="flex items-center gap-1 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="font-mono text-xs text-[#d1d5db] break-all bg-gray-900 p-3 rounded max-h-32 overflow-y-auto">
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
}