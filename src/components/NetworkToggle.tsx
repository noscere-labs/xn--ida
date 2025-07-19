import { Network } from '../services/whatsonchain';

interface NetworkToggleProps {
  network: Network;
  onNetworkChange: (network: Network) => void;
}

export default function NetworkToggle({ network, onNetworkChange }: NetworkToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-400">Network:</span>
      <div className="relative inline-flex bg-gray-800 rounded-full p-1">
        <button
          onClick={() => onNetworkChange('main')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
            network === 'main'
              ? 'bg-[#0a84ff] text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Main
        </button>
        <button
          onClick={() => onNetworkChange('test')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
            network === 'test'
              ? 'bg-[#0a84ff] text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Test
        </button>
      </div>
    </div>
  );
}