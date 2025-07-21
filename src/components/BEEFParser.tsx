'use client';

import { Beef } from '@bsv/sdk';
import { useCallback, useEffect, useState } from 'react';
import { Network, whatsOnChainService } from '../services/whatsonchain';

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
  validation?: {
    isValidating: boolean;
    isValid?: boolean;
    blockHash?: string;
    merkleRoot?: string;
    error?: string;
    validTransactions: string[];
    invalidTransactions: string[];
  };
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

interface BEEFParserProps {
  network: Network;
}

export default function BEEFParser({ network }: BEEFParserProps) {
  const [beefData, setBeefData] = useState<string>('');
  const [parsedBEEF, setParsedBEEF] = useState<ParsedBEEF | null>(null);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'bumps' | 'transactions'>('overview');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const [validatingBumps, setValidatingBumps] = useState<Set<number>>(new Set());
  const [isParserCollapsed, setIsParserCollapsed] = useState<boolean>(false);
  const [displayFormat, setDisplayFormat] = useState<'hex' | 'array'>('hex');

  // Sync network with WhatsOnChain service
  useEffect(() => {
    whatsOnChainService.setNetwork(network);
  }, [network]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Utility function to detect and convert number array to hex
  const convertInputToHex = useCallback((input: string): string => {
    const trimmed = input.trim();
    
    // Check if input looks like a number array (starts with [ and contains numbers)
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        // Parse the array string
        const numberArray = JSON.parse(trimmed);
        
        // Validate it's an array of numbers
        if (Array.isArray(numberArray) && numberArray.every(n => typeof n === 'number' && n >= 0 && n <= 255)) {
          // Convert to hex string
          return numberArray.map(n => n.toString(16).padStart(2, '0')).join('');
        }
      } catch {
        // If JSON parsing fails, treat as hex
      }
    }
    
    // Default: treat as hex and clean whitespace
    return trimmed.replace(/\s/g, '');
  }, []);

  // Utility function to convert hex string to number array
  const convertHexToArray = useCallback((hex: string): number[] => {
    const cleanHex = hex.replace(/\s/g, '');
    const result: number[] = [];
    
    for (let i = 0; i < cleanHex.length; i += 2) {
      const hexByte = cleanHex.substr(i, 2);
      const byte = parseInt(hexByte, 16);
      if (!isNaN(byte)) {
        result.push(byte);
      }
    }
    
    return result;
  }, []);

  const parseBEEF = useCallback((inputData: string): ParsedBEEF => {
    try {
      const hexData = convertInputToHex(inputData);
      const beef = Beef.fromString(hexData, 'hex');

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
        raw: convertInputToHex(inputData)
      };
    } catch (err) {
      throw new Error(`Failed to parse BEEF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [convertInputToHex]);

  const handleParseBEEF = () => {
    try {
      setError('');
      const parsed = parseBEEF(beefData);
      setParsedBEEF(parsed);
      // Panel will auto-collapse via useEffect
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown parsing error');
      setParsedBEEF(null);
    }
  };


  // Reset to expanded state when new data is loaded
  useEffect(() => {
    if (parsedBEEF) {
      // Small delay to ensure smooth animation
      const timer = setTimeout(() => {
        setIsParserCollapsed(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [parsedBEEF]);

  const validateBump = async (bumpIndex: number) => {
    if (!parsedBEEF) return;

    const bump = parsedBEEF.bumps[bumpIndex];
    if (!bump || validatingBumps.has(bumpIndex)) return;

    // Set validating state
    setValidatingBumps(prev => new Set([...prev, bumpIndex]));

    // Update bump validation state to show loading
    const updatedBumps = [...parsedBEEF.bumps];
    updatedBumps[bumpIndex] = {
      ...bump,
      validation: {
        isValidating: true,
        validTransactions: [],
        invalidTransactions: []
      }
    };
    setParsedBEEF({ ...parsedBEEF, bumps: updatedBumps });

    try {
      // Get transaction IDs that have this bump
      const txidsWithBump = parsedBEEF.transactions
        .filter(tx => tx.bumpIndex === bumpIndex)
        .map(tx => tx.txid);

      // Validate the bump data against the blockchain
      const validationResult = await whatsOnChainService.validateBumpData(
        bump.blockHeight,
        txidsWithBump
      );

      // Update the bump with validation results
      updatedBumps[bumpIndex] = {
        ...bump,
        validation: {
          isValidating: false,
          isValid: validationResult.isValid,
          blockHash: validationResult.blockHash,
          merkleRoot: validationResult.merkleRoot,
          error: validationResult.error,
          validTransactions: validationResult.validTransactions,
          invalidTransactions: validationResult.invalidTransactions
        }
      };

      setParsedBEEF({ ...parsedBEEF, bumps: updatedBumps });

    } catch (error) {
      // Handle validation error
      updatedBumps[bumpIndex] = {
        ...bump,
        validation: {
          isValidating: false,
          isValid: false,
          error: error instanceof Error ? error.message : 'Unknown validation error',
          validTransactions: [],
          invalidTransactions: parsedBEEF.transactions
            .filter(tx => tx.bumpIndex === bumpIndex)
            .map(tx => tx.txid)
        }
      };
      setParsedBEEF({ ...parsedBEEF, bumps: updatedBumps });
    } finally {
      setValidatingBumps(prev => {
        const newSet = new Set(prev);
        newSet.delete(bumpIndex);
        return newSet;
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const HashDisplay = ({ hash, label, showToggle = false }: { hash: string; label?: string; showToggle?: boolean }) => {
    const displayText = displayFormat === 'hex' ? hash : `[${convertHexToArray(hash).join(',')}]`;
    
    return (
      <div className="group">
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-xs font-medium text-gray-400">{label}:</span>}
          <div className="flex items-center gap-2">
            {showToggle && (
              <button
                onClick={() => setDisplayFormat(displayFormat === 'hex' ? 'array' : 'hex')}
                className="px-2 py-1 bg-[#0a84ff] hover:bg-[#3ea6ff] text-white text-xs rounded transition-all"
                title={`Switch to ${displayFormat === 'hex' ? 'number array' : 'hex'} format`}
              >
                {displayFormat === 'hex' ? '[]' : 'hex'}
              </button>
            )}
            <button
              onClick={() => copyToClipboard(displayText)}
              className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-all"
              title="Copy to clipboard"
            >
              📋 Copy
            </button>
          </div>
        </div>
        <div className="p-2 bg-gray-900 rounded border font-mono text-xs text-blue-400 break-all leading-relaxed">
          {displayText}
        </div>
      </div>
    );
  };

  const formatSatoshis = (satoshis: number): string => {
    return `${satoshis.toLocaleString()} sat (${(satoshis / 100000000).toFixed(8)} BSV)`;
  };

  const toggleParserCollapse = () => {
    setIsParserCollapsed(!isParserCollapsed);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-4xl sm:text-4xl font-bold mb-4">
          <span className="bg-gradient-to-r from-[#0a84ff] to-[#a855f7] bg-clip-text text-transparent">
            BEEF Parser
          </span>
        </h1>
        <p className="text-xl text-[#d1d5db] max-w-3xl mx-auto">
          Parse and analyse BEEF (Background Evaluation Extended Format) transactions
        </p>
      </div>

      <div className="bg-[#0f172a] rounded-lg overflow-hidden mb-6 transition-all duration-500 ease-in-out">
        {/* Collapse/Expand Header */}
        {parsedBEEF && (
          <div className="flex items-center justify-between p-4 bg-gray-800/50 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white">BEEF Parser</span>
              <span className="text-xs text-gray-400">
                {isParserCollapsed ? 'Collapsed' : 'Expanded'}
              </span>
            </div>
            <button
              onClick={toggleParserCollapse}
              className="flex items-center gap-2 px-3 py-1 text-sm text-[#0a84ff] hover:text-[#3ea6ff] transition-colors"
            >
              {isParserCollapsed ? 'Expand' : 'Collapse'}
              <span className={`transform transition-transform duration-300 ${isParserCollapsed ? 'rotate-180' : 'rotate-0'}`}>
                ▼
              </span>
            </button>
          </div>
        )}

        {/* Collapsible Content */}
        <div
          className={`transition-all duration-500 ease-in-out overflow-hidden ${isParserCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
            }`}
          style={{
            transform: isParserCollapsed ? 'translate3d(0, -10px, 0)' : 'translate3d(0, 0, 0)',
            willChange: 'transform, opacity, max-height',
          }}
        >
          <div className="p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#d1d5db] mb-2">
                BEEF Transaction Data
              </label>
              <textarea
                value={beefData}
                onChange={(e) => setBeefData(e.target.value)}
                placeholder="Paste your BEEF transaction data here (hex string or number array like [1,2,3,4,...])"
                className="w-full h-32 p-3 bg-gray-800 border border-gray-700 rounded-lg font-mono text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-[#0a84ff] focus:border-transparent resize-none transition-all duration-200"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleParseBEEF}
                  disabled={!beefData.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0a84ff] text-white rounded-lg hover:bg-[#3ea6ff] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                >
                  Parse BEEF
                </button>
                <button
                  onClick={() => {
                    const sampleBEEF = "0100beef01fe636d0c0007021400fe507c0c7aa754cef1f7889d5fd395cf1f785dd7de98eed895dbedfe4e5bc70d1502ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e010b00bc4ff395efd11719b277694cface5aa50d085a0bb81f613f70313acd28cf4557010400574b2d9142b8d28b61d88e3b2c3f44d858411356b49a28a4643b6d1a6a092a5201030051a05fc84d531b5d250c23f4f886f6812f9fe3f402d61607f977b4ecd2701c19010000fd781529d58fc2523cf396a7f25440b409857e7e221766c57214b1d38c7b481f01010062f542f45ea3660f86c013ced80534cb5fd4c19d66c56e7e8c5d4bf2d40acc5e010100b121e91836fd7cd5102b654e9f72f3cf6fdbfd0b161c53a9c54b12c841126331020100000001cd4e4cac3c7b56920d1e7655e7e260d31f29d9a388d04910f1bbd72304a79029010000006b483045022100e75279a205a547c445719420aa3138bf14743e3f42618e5f86a19bde14bb95f7022064777d34776b05d816daf1699493fcdf2ef5a5ab1ad710d9c97bfb5b8f7cef3641210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013e660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000001000100000001ac4e164f5bc16746bb0868404292ac8318bbac3800e4aad13a014da427adce3e000000006a47304402203a61a2e931612b4bda08d541cfb980885173b8dcf64a3471238ae7abcd368d6402204cbf24f04b9aa2256d8901f0ed97866603d2be8324c2bfb7a37bf8fc90edd5b441210263e2dee22b1ddc5e11f6fab8bcd2378bdd19580d640501ea956ec0e786f93e76ffffffff013c660000000000001976a9146bfd5c7fbe21529d45803dbcf0c87dd3c71efbc288ac0000000000";
                    setBeefData(sampleBEEF);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 transform hover:scale-105"
                >
                  Load Sample (Hex)
                </button>
                <button
                  onClick={() => {
                    const sampleArray = "[1,1,1,1,242,62,90,236,91,226,147,148,74,60,186,83,122,30,185,230,34,181,113,73,126,31,29,25,122,189,231,231,148,2,236,82,2,0,190,239,2,254,190,182,25,0,3,2,2,0,38,94,144,155,104,228,6,115,136,59,26,33,144,197,42,13,210,5,105,6,28,221,165,61,65,193,138,236,234,118,211,23,3,2,117,15,39,25,109,58,204,252,227,17,181,32,39,110,75,54,31,217,248,245,78,89,159,107,254,109,46,254,109,67,244,234,1,0,0,73,57,248,178,234,101,35,95,241,187,5,220,126,169,64,133,115,50,35,209,133,153,238,80,228,1,23,247,235,22,124,84,1,1,0,125,3,56,157,70,167,217,61,228,210,215,119,72,91,211,81,38,224,140,178,1,157,182,186,2,127,135,247,79,228,60,142,254,189,182,25,0,5,2,0,0,30,131,243,189,107,112,204,78,195,183,232,215,210,72,59,136,87,124,165,105,202,218,119,58,213,200,1,41,22,244,22,51,1,2,123,48,132,85,59,80,19,168,84,167,224,77,76,71,52,43,211,182,218,233,75,135,122,104,164,235,222,220,44,190,100,11,1,1,0,13,61,221,3,206,161,237,92,57,200,9,198,17,74,244,205,248,30,153,183,5,190,2,232,57,228,88,124,160,50,109,33,1,1,0,94,196,11,255,86,213,52,67,47,122,209,192,86,139,118,218,115,90,252,184,55,169,65,111,95,25,36,143,33,153,50,114,1,1,0,60,250,54,102,118,24,188,115,113,190,217,35,94,253,91,177,65,164,4,209,24,247,138,147,71,33,215,243,8,7,36,97,1,1,0,23,165,212,201,135,135,7,48,25,252,240,36,185,37,190,241,8,85,75,6,189,253,54,78,186,224,166,57,71,140,183,135,3,1,0,1,0,0,0,2,38,94,144,155,104,228,6,115,136,59,26,33,144,197,42,13,210,5,105,6,28,221,165,61,65,193,138,236,234,118,211,23,0,0,0,0,73,72,48,69,2,33,0,249,195,227,51,223,62,80,152,142,132,193,93,161,97,253,254,11,138,232,254,33,145,43,135,221,157,144,103,148,202,193,192,2,32,126,143,56,180,35,91,20,89,117,199,107,145,36,241,97,168,138,32,150,10,75,194,174,251,130,230,237,216,69,199,247,75,65,255,255,255,255,104,118,101,3,80,165,142,57,54,23,57,13,75,202,243,163,138,149,212,56,95,2,137,12,201,108,14,179,173,30,56,14,7,0,0,0,107,72,48,69,2,33,0,183,107,12,33,122,110,244,39,137,124,235,185,180,61,120,65,151,208,164,239,12,48,138,223,151,137,39,120,149,28,182,221,2,32,56,102,117,210,181,224,76,194,111,66,201,57,184,246,69,46,46,198,143,166,32,158,140,96,40,90,167,239,201,121,255,66,65,33,3,200,74,75,92,30,71,113,80,55,39,145,182,190,229,130,214,24,22,48,65,193,53,120,191,202,159,38,160,42,85,109,234,255,255,255,255,2,1,0,0,0,0,0,0,0,44,33,3,171,183,51,73,82,240,140,6,45,176,110,131,209,200,184,20,87,216,245,89,230,23,133,100,132,241,56,33,96,81,113,128,172,7,84,79,75,69,78,95,65,117,31,0,0,0,0,0,0,0,25,118,169,20,214,125,42,42,163,38,40,172,122,245,154,236,8,140,222,115,9,52,203,85,136,172,0,0,0,0,1,1,1,0,0,0,1,168,128,10,241,54,186,65,236,135,75,40,93,74,100,57,251,130,218,57,180,201,250,157,144,197,184,59,61,188,235,115,149,0,0,0,0,107,72,48,69,2,33,0,176,208,40,99,173,168,15,208,54,211,159,26,5,119,255,96,243,219,31,205,74,72,214,36,28,212,20,162,201,137,62,19,2,32,24,135,33,40,199,27,207,136,10,175,139,151,200,70,70,70,19,181,42,99,52,232,1,135,114,58,235,163,174,212,38,15,65,33,2,203,7,248,12,114,213,219,140,70,247,68,71,156,116,205,202,64,235,5,137,149,218,222,50,40,37,254,227,201,55,230,133,255,255,255,255,11,1,0,0,0,0,0,0,0,50,33,3,119,173,8,185,47,88,59,175,57,217,252,66,200,210,103,191,242,135,104,155,125,59,48,111,153,172,49,85,30,22,0,148,172,13,84,79,75,69,78,95,65,65,65,95,82,69,68,117,10,0,0,0,0,0,0,0,25,118,169,20,37,120,61,103,63,169,206,159,66,162,252,112,241,0,99,246,129,7,120,204,136,172,32,0,0,0,0,0,0,0,25,118,169,20,212,86,144,212,87,128,142,190,230,59,145,100,88,176,151,156,32,224,235,89,136,172,32,0,0,0,0,0,0,0,25,118,169,20,124,1,166,44,166,250,127,4,107,122,64,30,163,27,31,189,228,210,8,41,136,172,32,0,0,0,0,0,0,0,25,118,169,20,46,46,124,139,117,5,253,229,132,136,84,79,46,99,42,137,19,152,52,4,136,172,32,0,0,0,0,0,0,0,25,118,169,20,189,149,67,45,49,24,189,223,43,187,27,130,116,192,119,166,104,192,136,82,136,172,32,0,0,0,0,0,0,0,25,118,169,20,209,184,86,184,167,70,155,87,49,23,235,236,104,58,149,58,226,63,248,207,136,172,32,0,0,0,0,0,0,0,25,118,169,20,10,163,33,102,16,168,223,206,2,223,162,184,160,204,44,18,142,157,204,86,136,172,32,0,0,0,0,0,0,0,25,118,169,20,77,250,25,149,150,77,55,234,27,157,33,224,15,28,7,119,222,132,175,15,136,172,32,0,0,0,0,0,0,0,25,118,169,20,242,87,250,10,236,222,20,205,200,207,237,168,93,74,80,194,54,189,97,2,136,172,32,0,0,0,0,0,0,0,25,118,169,20,91,35,26,185,213,147,79,230,177,105,32,113,241,60,84,29,33,101,88,17,136,172,0,0,0,0,0,1,0,0,0,2,117,15,39,25,109,58,204,252,227,17,181,32,39,110,75,54,31,217,248,245,78,89,159,107,254,109,46,254,109,67,244,234,0,0,0,0,72,71,48,68,2,32,30,197,112,63,250,224,106,19,29,160,231,242,79,157,225,30,192,120,104,15,123,125,224,205,66,160,182,83,139,10,119,116,2,32,30,195,182,46,222,158,202,187,243,79,95,146,224,62,163,130,178,231,28,208,121,216,27,172,98,77,79,31,190,78,79,184,65,255,255,255,255,123,48,132,85,59,80,19,168,84,167,224,77,76,71,52,43,211,182,218,233,75,135,122,104,164,235,222,220,44,190,100,11,9,0,0,0,106,71,48,68,2,32,38,52,154,4,3,9,133,49,108,254,135,248,60,84,47,61,124,121,204,244,15,100,7,148,109,12,231,57,185,162,197,49,2,32,77,247,177,195,10,40,74,167,155,224,155,12,171,192,251,89,35,174,78,108,151,7,255,36,31,207,210,191,102,172,147,123,65,33,2,232,246,191,124,100,170,144,125,179,232,220,230,203,127,12,83,160,146,108,13,50,152,41,229,93,126,121,66,129,96,156,202,255,255,255,255,2,1,0,0,0,0,0,0,0,44,33,3,7,99,171,39,99,10,94,9,133,34,217,52,208,62,152,143,122,122,52,122,21,182,230,36,22,144,55,241,23,213,232,125,172,7,84,79,75,69,78,95,65,117,31,0,0,0,0,0,0,0,25,118,169,20,112,26,111,85,135,119,244,13,70,66,213,72,179,69,77,175,62,218,207,13,136,172,0,0,0,0]";
                    setBeefData(sampleArray);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 transform hover:scale-105"
                >
                  Load Sample (Array)
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="text-red-400">{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {parsedBEEF && (
        <div className="bg-[#0f172a] rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${activeTab === id
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

                  <button
                    onClick={() => setActiveTab('bumps')}
                    className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg text-left hover:bg-green-500/20 hover:border-green-500/30 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">BUMP Proofs</span>
                      <span className="text-xs text-green-400">Click to view →</span>
                    </div>
                    <div className="text-2xl font-bold text-green-400">{parsedBEEF.bumps.length}</div>
                    <div className="text-sm text-[#d1d5db]">
                      {parsedBEEF.bumps.filter(b => b.validation?.isValid).length} validated, {parsedBEEF.bumps.length} total
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab('transactions')}
                    className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-lg text-left hover:bg-purple-500/20 hover:border-purple-500/30 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Transactions</span>
                      <span className="text-xs text-purple-400">Click to view →</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-400">{parsedBEEF.transactions.length}</div>
                    <div className="text-sm text-[#d1d5db]">
                      {parsedBEEF.transactions.filter(tx => tx.hasBump).length} with proofs
                    </div>
                  </button>
                </div>

                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <HashDisplay hash={parsedBEEF.raw} label="Raw BEEF Data" showToggle={true} />
                  <div className="text-sm text-gray-400 mt-2">
                    Total size: {parsedBEEF.totalSize.toLocaleString()} bytes • Format: {displayFormat === 'hex' ? 'Hexadecimal' : 'Number Array'}
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
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {bump.validation?.isValidating ? (
                              <div className="w-4 h-4 border-2 border-[#0a84ff] border-t-transparent rounded-full animate-spin" />
                            ) : bump.validation?.isValid === true ? (
                              <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                              </div>
                            ) : bump.validation?.isValid === false ? (
                              <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">✗</span>
                              </div>
                            ) : (
                              <div className="w-4 h-4 bg-gray-500 rounded-full" />
                            )}
                            <span className="font-medium">BUMP {index + 1}</span>
                          </div>
                          <span className="text-sm text-[#d1d5db]">
                            Block: {bump.blockHeight}, Tree Height: {bump.treeHeight}
                          </span>
                          {bump.validation?.blockHash && (
                            <div className="text-xs text-green-400">
                              Block Hash: {bump.validation.blockHash}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!bump.validation && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                validateBump(index);
                              }}
                              disabled={validatingBumps.has(index)}
                              className="px-3 py-1 bg-[#0a84ff] text-white text-sm rounded hover:bg-[#3ea6ff] disabled:opacity-50 transition-colors"
                            >
                              Validate
                            </button>
                          )}
                          <div className="text-[#0a84ff]">
                            {expandedSections.has(`bump-${index}`) ? '▼' : '▶'}
                          </div>
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

                          {bump.validation && (
                            <div className="border border-gray-600 rounded p-3 space-y-2">
                              <h5 className="font-medium text-sm">Validation Results</h5>

                              {bump.validation.isValidating ? (
                                <div className="flex items-center gap-2 text-sm text-[#0a84ff]">
                                  <div className="w-4 h-4 border-2 border-[#0a84ff] border-t-transparent rounded-full animate-spin" />
                                  Validating against {network} network...
                                </div>
                              ) : (
                                <>
                                  <div className={`text-sm font-medium ${bump.validation.isValid ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                    {bump.validation.isValid ? '✓ Valid BUMP proof' : '✗ Invalid BUMP proof'}
                                  </div>

                                  {bump.validation.blockHash && (
                                    <div className="mt-2">
                                      <HashDisplay hash={bump.validation.blockHash} label="Block Hash" />
                                    </div>
                                  )}

                                  {bump.validation.merkleRoot && (
                                    <div className="mt-2">
                                      <HashDisplay hash={bump.validation.merkleRoot} label="Merkle Root" />
                                    </div>
                                  )}

                                  {bump.validation.validTransactions.length > 0 && (
                                    <div className="text-xs text-green-400">
                                      <span className="font-medium">Valid Transactions:</span> {bump.validation.validTransactions.length}
                                    </div>
                                  )}

                                  {bump.validation.invalidTransactions.length > 0 && (
                                    <div className="text-xs text-red-400">
                                      <span className="font-medium">Invalid Transactions:</span> {bump.validation.invalidTransactions.length}
                                    </div>
                                  )}

                                  {bump.validation.error && (
                                    <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                                      {bump.validation.error}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          <div>
                            <h4 className="font-medium mb-2">Merkle Path Levels</h4>
                            <div className="space-y-2">
                              {bump.paths.map((level, levelIndex) => (
                                <div key={levelIndex} className="border border-gray-600 rounded p-3">
                                  <div className="font-medium text-sm mb-2">Level {levelIndex} ({level.length} leaves)</div>
                                  <div className="grid gap-2">
                                    {level.map((leaf, leafIndex) => (
                                      <div key={leafIndex} className="border border-gray-600 rounded p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-400 text-xs font-medium">Offset #{leaf.offset}</span>
                                          <span className={`px-2 py-1 rounded text-xs font-medium ${leaf.isClientTxid ? 'bg-[#0a84ff]/20 text-[#0a84ff]' :
                                            leaf.isDuplicate ? 'bg-yellow-500/20 text-yellow-400' :
                                              'bg-gray-700 text-gray-300'
                                            }`}>
                                            {leaf.isClientTxid ? 'Client TXID' :
                                              leaf.isDuplicate ? 'Duplicate' : 'Sibling'}
                                          </span>
                                        </div>
                                        {leaf.hash && (
                                          <HashDisplay hash={leaf.hash} />
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
                        <span className="text-sm text-[#d1d5db] font-mono">{tx.txid}</span>
                        {tx.hasBump && (
                          <span className={`px-2 py-1 text-xs rounded ${parsedBEEF.bumps[tx.bumpIndex!]?.validation?.isValid === true
                            ? 'bg-green-500/20 text-green-400'
                            : parsedBEEF.bumps[tx.bumpIndex!]?.validation?.isValid === false
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-500/20 text-gray-400'
                            }`}>
                            {parsedBEEF.bumps[tx.bumpIndex!]?.validation?.isValid === true
                              ? '✓ Validated Proof'
                              : parsedBEEF.bumps[tx.bumpIndex!]?.validation?.isValid === false
                                ? '✗ Invalid Proof'
                                : 'Has Proof'
                            }
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
                            <HashDisplay hash={tx.txid} label="Transaction ID" />
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
                                    <div className="mt-2">
                                      <HashDisplay hash={input.prevTxHash} label="Previous TX" />
                                    </div>
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
                                      <div className="mt-2">
                                        <HashDisplay hash={output.script} label="Script" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <HashDisplay hash={tx.rawHex} label="Raw Transaction" />
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