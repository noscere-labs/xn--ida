import NetworkToggle from './NetworkToggle';
import { Network } from '../services/whatsonchain';

interface HeaderProps {
  breadcrumbs?: { label: string; href?: string; onClick?: () => void }[];
  showNetworkToggle?: boolean;
  network?: Network;
  onNetworkChange?: (network: Network) => void;
}

export default function Header({ 
  breadcrumbs = [{ label: 'Tools' }], 
  showNetworkToggle = false, 
  network, 
  onNetworkChange 
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-[#0f172a] backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold tracking-tight uppercase">NOSCERE</h1>
          </div>
          <div className="flex items-center gap-6">
            <nav className="flex items-center space-x-2">
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center">
                  {index > 0 && <span className="text-gray-400 mx-2">/</span>}
                  {crumb.href ? (
                    crumb.onClick ? (
                      <button
                        onClick={crumb.onClick}
                        className="text-[#0a84ff] hover:text-[#3ea6ff] transition-colors"
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <a 
                        href={crumb.href} 
                        className="text-[#0a84ff] hover:text-[#3ea6ff] transition-colors"
                      >
                        {crumb.label}
                      </a>
                    )
                  ) : (
                    <span className="text-white">{crumb.label}</span>
                  )}
                </div>
              ))}
            </nav>
            {showNetworkToggle && network && onNetworkChange && (
              <NetworkToggle network={network} onNetworkChange={onNetworkChange} />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}