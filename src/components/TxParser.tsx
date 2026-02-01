'use client'

import { Script, Transaction } from '@bsv/sdk'
import { useState } from 'react'

// Tooltip component for field explanations
const InfoTooltip = ({ text }: { text: string }) => {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative inline-block ml-1">
      <button
        className="text-[#94a3b8] hover:text-blue-400 text-xs"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={(e) => e.preventDefault()}
      >
        ⓘ
      </button>
      {isVisible && (
        <div className="absolute z-10 w-64 p-2 text-xs text-white bg-[#1a2332] border border-gray-600 rounded shadow-lg bottom-full left-0 mb-1">
          {text}
          <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
        </div>
      )}
    </div>
  )
}

// VarInt explainer component
const VarIntExplainer = () => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-[#111827] rounded-lg p-4 mb-6 border border-[#1e3a5f]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-lg font-bold text-[#3b82f6]">About VarInt Encoding</h3>
        <span className="text-[#94a3b8]">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-3 text-sm text-[#cbd5e1]">
          <p>
            VarInt (Variable Integer) is a space-efficient encoding method used throughout Bitcoin
            transactions to represent integers of varying sizes using the minimum number of bytes.
          </p>

          <div className="bg-[#0a0e1a] rounded p-3">
            <h4 className="font-bold text-blue-400 mb-2">Encoding Rules:</h4>
            <ul className="space-y-1 font-mono text-xs">
              <li><span className="text-green-400">0-252:</span> 1 byte (direct value)</li>
              <li><span className="text-green-400">253-65,535:</span> 3 bytes (0xFD + 2-byte little-endian)</li>
              <li><span className="text-green-400">65,536-4,294,967,295:</span> 5 bytes (0xFE + 4-byte little-endian)</li>
              <li><span className="text-green-400">4,294,967,296+:</span> 9 bytes (0xFF + 8-byte little-endian)</li>
            </ul>
          </div>

          <div className="bg-[#0a0e1a] rounded p-3">
            <h4 className="font-bold text-blue-400 mb-2">Examples:</h4>
            <ul className="space-y-1 font-mono text-xs">
              <li><span className="text-yellow-400">187</span> → <span className="text-green-400">0xBB</span> (1 byte)</li>
              <li><span className="text-yellow-400">255</span> → <span className="text-green-400">0xFDFF00</span> (3 bytes)</li>
              <li><span className="text-yellow-400">14,435,729</span> → <span className="text-green-400">0xFE9145DC00</span> (5 bytes)</li>
            </ul>
          </div>

          <p className="text-xs text-[#94a3b8]">
            Fields marked with &quot;VarInt&quot; in the transaction use this encoding for efficient storage.
          </p>
        </div>
      )}
    </div>
  )
}

interface ParsedTransaction {
  version: string
  versionLength: number
  txInsVi: string
  txInsViLength: number
  inputs: Array<{
    txHashBuf: string
    txHashBufLength: number
    txOutNum: string
    txOutNumLength: number
    scriptVi: string
    scriptViLength: number
    script: string
    scriptLength: number
    nSequence: string
    nSequenceLength: number
    totalLength: number
  }>
  txOutsVi: string
  txOutsViLength: number
  outputs: Array<{
    valueBn: string
    valueBnLength: number
    scriptVi: string
    scriptViLength: number
    script: string
    scriptLength: number
    tokenScriptHash: string
    tokenScriptHashLength: number
    totalLength: number
  }>
  nLockTime: string
  nLockTimeLength: number
}

interface BitcoinTransactionParserProps {
  network?: string;
}

export default function BitcoinTransactionParser({ network = 'main' }: BitcoinTransactionParserProps) {
  const [hexInput, setHexInput] = useState<string>('')
  const [parsedTx, setParsedTx] = useState<ParsedTransaction | null>(null)
  const [parseError, setParseError] = useState<string>('')
  const [parsing, setParsing] = useState<boolean>(false)
  const [showSizing, setShowSizing] = useState<boolean>(true)
  const [scriptDisplayMode, setScriptDisplayMode] = useState<'hex' | 'asm'>('asm')
  const [expandedInputs, setExpandedInputs] = useState<Set<number>>(new Set())
  const [expandedOutputs, setExpandedOutputs] = useState<Set<number>>(new Set())

  const parseTransaction = async () => {
    if (!hexInput.trim()) {
      setParseError('Please enter a transaction hex string')
      return
    }

    setParsing(true)
    setParseError('')
    setParsedTx(null)

    try {
      // Remove any whitespace and validate hex
      const cleanHex = hexInput.replace(/\s/g, '')
      if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
        throw new Error('Invalid hex string - contains non-hexadecimal characters')
      }

      if (cleanHex.length % 2 !== 0) {
        throw new Error('Invalid hex string - odd number of characters')
      }

      const txBytes = new Uint8Array(cleanHex.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || [])
      Transaction.fromBinary(Array.from(txBytes))

      // Parse the transaction manually to extract the detailed breakdown
      const parsed = await parseTransactionDetails(cleanHex)
      setParsedTx(parsed)

    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to parse transaction')
    } finally {
      setParsing(false)
    }
  }

  const parseTransactionDetails = async (hex: string): Promise<ParsedTransaction> => {
    const hexBytes = new Uint8Array(hex.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || [])
    let offset = 0

    // Helper function to read bytes and advance offset
    const readBytes = (length: number) => {
      const bytes = hexBytes.slice(offset, offset + length)
      offset += length
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    }

    // Helper function to read variable integer
    const readVarInt = () => {
      const first = hexBytes[offset]
      if (first < 0xfd) {
        offset += 1
        return { value: first, hex: first.toString(16).padStart(2, '0'), length: 1 }
      } else if (first === 0xfd) {
        offset += 1
        const value = hexBytes[offset] | (hexBytes[offset + 1] << 8)
        const hex = Array.from(hexBytes.slice(offset - 1, offset + 2)).map(b => b.toString(16).padStart(2, '0')).join('')
        offset += 2
        return { value, hex, length: 3 }
      } else if (first === 0xfe) {
        offset += 1
        const value = hexBytes[offset] | (hexBytes[offset + 1] << 8) | (hexBytes[offset + 2] << 16) | (hexBytes[offset + 3] << 24)
        const hex = Array.from(hexBytes.slice(offset - 1, offset + 4)).map(b => b.toString(16).padStart(2, '0')).join('')
        offset += 4
        return { value, hex, length: 5 }
      } else {
        throw new Error('8-byte varints not supported')
      }
    }

    // Parse version (4 bytes, little-endian)
    const version = readBytes(4)
    const versionLength = 4

    // Parse input count
    const txInsVi = readVarInt()

    // Parse inputs
    const inputs = []
    for (let i = 0; i < txInsVi.value; i++) {
      const txHashBuf = readBytes(32) // Previous tx hash (32 bytes)
      const txOutNum = readBytes(4)   // Previous tx output index (4 bytes)

      const scriptVi = readVarInt()   // Script length
      const script = readBytes(scriptVi.value) // Script
      const nSequence = readBytes(4)  // Sequence (4 bytes)

      inputs.push({
        txHashBuf,
        txHashBufLength: 32,
        txOutNum,
        txOutNumLength: 4,
        scriptVi: scriptVi.hex,
        scriptViLength: scriptVi.length,
        script,
        scriptLength: scriptVi.value,
        nSequence,
        nSequenceLength: 4,
        totalLength: 32 + 4 + scriptVi.length + scriptVi.value + 4
      })
    }

    // Parse output count
    const txOutsVi = readVarInt()

    // Parse outputs
    const outputs = []
    for (let i = 0; i < txOutsVi.value; i++) {
      const valueBn = readBytes(8)    // Value (8 bytes, little-endian)
      const scriptVi = readVarInt()   // Script length
      const script = readBytes(scriptVi.value) // Script

      // Calculate token script hash (SHA256 of the script)
      const scriptBytes = new Uint8Array(script.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || [])
      let hashBuffer = 'calculating...'
      if (crypto.subtle) {
        try {
          const hash = await crypto.subtle.digest('SHA-256', scriptBytes)
          hashBuffer = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
        } catch {
          hashBuffer = 'hash_calculation_failed'
        }
      }

      outputs.push({
        valueBn,
        valueBnLength: 8,
        scriptVi: scriptVi.hex,
        scriptViLength: scriptVi.length,
        script,
        scriptLength: scriptVi.value,
        tokenScriptHash: hashBuffer,
        tokenScriptHashLength: scriptVi.value,
        totalLength: 8 + scriptVi.length + scriptVi.value
      })
    }

    // Parse locktime (4 bytes)
    const nLockTime = readBytes(4)
    const nLockTimeLength = 4

    return {
      version,
      versionLength,
      txInsVi: txInsVi.hex,
      txInsViLength: txInsVi.length,
      inputs,
      txOutsVi: txOutsVi.hex,
      txOutsViLength: txOutsVi.length,
      outputs,
      nLockTime,
      nLockTimeLength
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Convert little-endian hex to decimal
  const hexToDecimal = (hexStr: string): string => {
    if (!hexStr || hexStr.length === 0) return '0'

    // Convert little-endian hex to big-endian for parsing
    const bytes = hexStr.match(/.{2}/g) || []
    const bigEndianHex = bytes.reverse().join('')

    // Parse as big integer to handle large values
    const decimal = BigInt('0x' + bigEndianHex)
    return decimal.toString()
  }

  // Convert script hex to ASM using BSV SDK
  const hexToASM = (hexScript: string): string => {
    if (!hexScript || hexScript.length === 0) return ''

    try {
      const script = Script.fromHex(hexScript)
      return script.toASM()
    } catch {
      return 'Script decode error'
    }
  }

  // Toggle functions for collapsible inputs/outputs
  const toggleInput = (index: number) => {
    const newExpanded = new Set(expandedInputs)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedInputs(newExpanded)
  }

  const toggleOutput = (index: number) => {
    const newExpanded = new Set(expandedOutputs)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedOutputs(newExpanded)
  }

  const clearInput = () => {
    setHexInput('')
    setParsedTx(null)
    setParseError('')
    setExpandedInputs(new Set())
    setExpandedOutputs(new Set())
  }

  // Sample transactions for testing (real transactions from WhatsOnChain)
  const loadSampleTransaction = () => {
    const mainnetSample = "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff1c03d7c6082f7376706f6f6c2e636f6d2f3edff034600055b8467f0040ffffffff01247e814a000000001976a914492558fb8ca71a3591316d095afc0f20ef7d42f788ac00000000"
    const testnetSample = "02000000010000000000000000000000000000000000000000000000000000000000000000ffffffff29034eb61904fa617d68726567696f6e312f50726f6a65637420425356506f6f6c2f010000bd00000000ffffffff01f2052a01000000001976a914e0abf1df63efc31b6739d386e30809afa4d1eebe88ac00000000"

    const sampleHex = network === 'main' ? mainnetSample : testnetSample
    setHexInput(sampleHex)
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">
          <span className="text-[#3b82f6]">
            Bitcoin Transaction Parser
          </span>
        </h1>
        <p className="text-[#d1d5db] text-lg">
          Parse and analyse the structure of standard Bitcoin transactions
        </p>
      </div>

      {/* Input Section */}
      <div className="bg-[#111827] rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Transaction Input</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Transaction Hex String
          </label>
          <textarea
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            placeholder="Enter transaction hex string..."
            className="w-full h-32 px-3 py-2 bg-[#0a0e1a] border border-[#1e3a5f] rounded font-mono text-sm resize-vertical"
          />
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={parseTransaction}
            disabled={parsing || !hexInput.trim()}
            className="px-4 py-2 bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {parsing ? 'Parsing...' : 'Parse Transaction'}
          </button>

          <button
            onClick={loadSampleTransaction}
            className="px-4 py-2 bg-[#1a2332] text-white rounded hover:bg-[#243447]"
          >
            Load Sample ({network === 'main' ? 'Mainnet' : 'Testnet'})
          </button>

          <button
            onClick={clearInput}
            className="px-4 py-2 bg-[#1a2332] text-white rounded hover:bg-[#243447]"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showSizing}
              onChange={(e) => setShowSizing(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show field sizes</span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-sm">Script display:</span>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scriptDisplay"
                value="hex"
                checked={scriptDisplayMode === 'hex'}
                onChange={() => setScriptDisplayMode('hex')}
                className="rounded"
              />
              <span className="text-sm">HEX</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scriptDisplay"
                value="asm"
                checked={scriptDisplayMode === 'asm'}
                onChange={() => setScriptDisplayMode('asm')}
                className="rounded"
              />
              <span className="text-sm">ASM</span>
            </label>
          </div>
        </div>

        {parseError && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded">
            <p className="text-red-400 text-sm">{parseError}</p>
          </div>
        )}
      </div>

      {/* VarInt Explainer */}
      <VarIntExplainer />

      {/* Parsed Output Section */}
      {parsedTx && (
        <div className="bg-[#111827] rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Transaction Breakdown</h2>

          <div className="space-y-6 font-mono text-sm">
            {/* Version */}
            <div className="border-b border-[#1e3a5f] pb-4">
              <div className="flex justify-between items-start group">
                <div className="flex items-center">
                  <span className="text-blue-400">version:</span>
                  <InfoTooltip text="Transaction format version number (4 bytes). Currently version 2 for most transactions. Identifies which transaction format rules to follow." />
                </div>
                <div className="flex flex-col items-end text-right">
                  <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded"
                    onClick={() => copyToClipboard(parsedTx.version)}>
                    {parsedTx.version}
                  </span>
                  {showSizing && (
                    <div className="text-[#94a3b8] text-xs">{parsedTx.versionLength} bytes</div>
                  )}
                </div>
              </div>
            </div>

            {/* Input Count */}
            <div className="border-b border-[#1e3a5f] pb-4">
              <div className="flex justify-between items-start group">
                <div className="flex items-center">
                  <span className="text-blue-400">txInsVi:</span>
                  <InfoTooltip text="Transaction input counter in VarInt format (1-9 bytes). Specifies how many inputs follow. Uses variable-length encoding to efficiently store the count." />
                </div>
                <div className="flex flex-col items-end text-right">
                  <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded"
                    onClick={() => copyToClipboard(parsedTx.txInsVi)}>
                    {parsedTx.txInsVi}
                  </span>
                  {showSizing && (
                    <div className="text-[#94a3b8] text-xs">{parsedTx.txInsViLength} bytes</div>
                  )}
                </div>
              </div>
            </div>

            {/* Inputs */}
            <div className="border-b border-[#1e3a5f] pb-4">
              <h3 className="text-lg font-bold mb-3 text-[#60a5fa]">Inputs</h3>
              {parsedTx.inputs.map((input, index) => (
                <div key={index} className="mb-4 p-4 bg-[#0a0e1a] rounded border-l-4 border-[#60a5fa]">
                  <button
                    onClick={() => toggleInput(index)}
                    className="flex items-center justify-between w-full text-left mb-2"
                  >
                    <h4 className="text-sm font-bold text-[#cbd5e1]">Input {index + 1}</h4>
                    <span className="text-[#94a3b8] hover:text-white transition-colors">
                      {expandedInputs.has(index) ? '▼' : '▶'}
                    </span>
                  </button>

                  {expandedInputs.has(index) && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">txHashBuf:</span>
                          <InfoTooltip text="Previous transaction hash (32 bytes). The TXID of the transaction containing the output being spent." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded break-all"
                            onClick={() => copyToClipboard(input.txHashBuf)}>
                            {input.txHashBuf}
                          </span>
                          {showSizing && (
                            <div className="text-[#94a3b8] text-xs">{input.txHashBufLength} bytes</div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">txOutNum:</span>
                          <InfoTooltip text="Previous output index (4 bytes). Specifies which output from the previous transaction is being spent (0-based index)." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded"
                            onClick={() => copyToClipboard(input.txOutNum)}>
                            {input.txOutNum}
                          </span>
                          {showSizing && (
                            <div className="text-[#94a3b8] text-xs">{input.txOutNumLength} bytes</div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">scriptVi:</span>
                          <InfoTooltip text="Script length in VarInt format (1-9 bytes). Specifies the length of the unlocking script that follows." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded"
                            onClick={() => copyToClipboard(input.scriptVi)}>
                            {input.scriptVi}
                          </span>
                          {showSizing && (
                            <div className="text-[#94a3b8] text-xs">{input.scriptViLength} bytes</div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">script ({scriptDisplayMode.toUpperCase()}):</span>
                          <InfoTooltip text="Unlocking script (variable length). Contains the scriptSig that proves ownership and provides conditions to unlock the previous output." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded break-all"
                            onClick={() => copyToClipboard(scriptDisplayMode === 'hex' ? input.script : hexToASM(input.script))}>
                            {scriptDisplayMode === 'hex' ? input.script : hexToASM(input.script)}
                          </span>
                          {showSizing && (
                            <div className="text-[#94a3b8] text-xs">{input.scriptLength} bytes</div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">nSequence:</span>
                          <InfoTooltip text="Sequence number (4 bytes). Used for payment channels and relative time locks. Input is final when nSequence = 0xFFFFFFFF." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded"
                            onClick={() => copyToClipboard(input.nSequence)}>
                            {input.nSequence}
                          </span>
                          {showSizing && (
                            <div className="text-[#94a3b8] text-xs">{input.nSequenceLength} bytes</div>
                          )}
                        </div>
                      </div>

                      {showSizing && (
                        <div className="text-green-400 text-xs font-bold mt-2">
                          totalLength: {input.totalLength}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Output Count */}
            <div className="border-b border-[#1e3a5f] pb-4">
              <div className="flex justify-between items-start group">
                <div className="flex items-center">
                  <span className="text-blue-400">txOutsVi:</span>
                  <InfoTooltip text="Transaction output counter in VarInt format (1-9 bytes). Specifies how many outputs follow. Uses variable-length encoding to efficiently store the count." />
                </div>
                <div className="flex flex-col items-end text-right">
                  <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded"
                    onClick={() => copyToClipboard(parsedTx.txOutsVi)}>
                    {parsedTx.txOutsVi}
                  </span>
                  {showSizing && (
                    <div className="text-[#94a3b8] text-xs">{parsedTx.txOutsViLength} bytes</div>
                  )}
                </div>
              </div>
            </div>

            {/* Outputs */}
            <div className="border-b border-[#1e3a5f] pb-4">
              <h3 className="text-lg font-bold mb-3 text-[#3b82f6]">Outputs</h3>
              {parsedTx.outputs.map((output, index) => (
                <div key={index} className="mb-4 p-4 bg-[#0a0e1a] rounded border-l-4 border-[#3b82f6]">
                  <button
                    onClick={() => toggleOutput(index)}
                    className="flex items-center justify-between w-full text-left mb-2"
                  >
                    <h4 className="text-sm font-bold text-[#cbd5e1]">Output {index + 1}</h4>
                    <span className="text-[#94a3b8] hover:text-white transition-colors">
                      {expandedOutputs.has(index) ? '▼' : '▶'}
                    </span>
                  </button>

                  {expandedOutputs.has(index) && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">valueBn:</span>
                          <InfoTooltip text="Output value (8 bytes). The number of satoshis to be transferred to this output, stored as little-endian integer." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded text-green-400"
                            onClick={() => copyToClipboard(hexToDecimal(output.valueBn))}>
                            {hexToDecimal(output.valueBn)} satoshis
                          </span>
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded text-[#94a3b8] text-xs"
                            onClick={() => copyToClipboard(output.valueBn)}>
                            (0x{output.valueBn})
                          </span>
                        </div>
                      </div>
                      {showSizing && (
                        <div className="text-[#94a3b8] text-xs">{output.valueBnLength} bytes</div>
                      )}

                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">scriptVi:</span>
                          <InfoTooltip text="Script length in VarInt format (1-9 bytes). Specifies the length of the locking script that follows." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded"
                            onClick={() => copyToClipboard(output.scriptVi)}>
                            {output.scriptVi}
                          </span>
                          {showSizing && (
                            <div className="text-[#94a3b8] text-xs">{output.scriptViLength} bytes</div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">script ({scriptDisplayMode.toUpperCase()}):</span>
                          <InfoTooltip text="Locking script (variable length). Contains the scriptPubKey that sets conditions to release the bitcoin amount in this output." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded break-all"
                            onClick={() => copyToClipboard(scriptDisplayMode === 'hex' ? output.script : hexToASM(output.script))}>
                            {scriptDisplayMode === 'hex' ? output.script : hexToASM(output.script)}
                          </span>
                          {showSizing && (
                            <div className="text-[#94a3b8] text-xs">{output.scriptLength} bytes</div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-start">
                        <div className="flex items-center">
                          <span className="text-blue-400">tokenScriptHash:</span>
                          <InfoTooltip text="SHA-256 hash of the locking script. Used to create script addresses and for script identification purposes." />
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded break-all"
                            onClick={() => copyToClipboard(output.tokenScriptHash)}>
                            {output.tokenScriptHash}
                          </span>
                          {showSizing && (
                            <div className="text-[#94a3b8] text-xs">{output.tokenScriptHashLength} bytes</div>
                          )}
                        </div>
                      </div>

                      {showSizing && (
                        <div className="text-green-400 text-xs font-bold mt-2">
                          totalLength: {output.totalLength}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Locktime */}
            <div>
              <div className="flex justify-between items-start group">
                <div className="flex items-center">
                  <span className="text-blue-400">nLockTime:</span>
                  <InfoTooltip text="Lock time (4 bytes). Block height or timestamp when transaction becomes final. If non-zero and sequence numbers < 0xFFFFFFFF, transaction is locked until this time." />
                </div>
                <div className="flex flex-col items-end text-right">
                  <span className="font-mono cursor-pointer hover:bg-[#1a2332] px-2 py-1 rounded"
                    onClick={() => copyToClipboard(parsedTx.nLockTime)}>
                    {parsedTx.nLockTime}
                  </span>
                  {showSizing && (
                    <div className="text-[#94a3b8] text-xs">{parsedTx.nLockTimeLength} bytes</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}