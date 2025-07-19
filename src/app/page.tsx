'use client';

import { useState } from 'react';
import BEEFParser from '../components/BEEFParser';
import MerkleTreeVisualizer from '../components/MerkleTreeVisualizer';
import Footer from '../components/Footer';
import Header from '../components/Header';

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  comingSoon?: boolean;
}

const tools: Tool[] = [
  {
    id: 'beef-parser',
    name: 'BEEF Parser',
    description: 'Parse and analyze BEEF transactions',
    icon: '🥩'
  },
  {
    id: 'merkle-tree',
    name: 'Merkle Tree Visualizer',
    description: 'Visualize and verify Merkle tree structures',
    icon: '🌳'
  }
];

import { Network } from '../services/whatsonchain';

export default function Home() {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [network, setNetwork] = useState<Network>('main');

  const handleToolSelect = (toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (tool?.comingSoon) {
      return;
    }
    setSelectedTool(toolId);
  };

  const handleBackToHome = () => {
    setSelectedTool(null);
  };

  if (selectedTool === 'beef-parser') {
    return (
      <div className="min-h-screen bg-black text-white font-sans">
        <Header 
          breadcrumbs={[
            {
              label: 'Tools',
              href: '#',
              onClick: handleBackToHome
            },
            { label: 'BEEF Parser' }
          ]}
          showNetworkToggle={true}
          network={network}
          onNetworkChange={setNetwork}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <BEEFParser network={network} onNetworkChange={setNetwork} />
        </main>

        <Footer />
      </div>
    );
  }

  if (selectedTool === 'merkle-tree') {
    return (
      <div className="min-h-screen bg-black text-white font-sans">
        <Header breadcrumbs={[
          {
            label: 'Tools',
            href: '#',
            onClick: handleBackToHome
          },
          { label: 'Merkle Tree Visualizer' }
        ]} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <MerkleTreeVisualizer />
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-[#0a84ff] to-[#a855f7] bg-clip-text text-transparent">
              Bitcoin SV
            </span>
            <br />
            <span className="bg-gradient-to-r from-[#0a84ff] to-[#a855f7] bg-clip-text text-transparent">
              Developer Tools
            </span>
          </h1>
          <p className="text-xl text-[#d1d5db] max-w-2xl mx-auto">
            A collection of powerful tools for Bitcoin SV development and analysis
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {tools.map((tool) => (
            <div
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className={`bg-[#0f172a] border border-gray-700 rounded-lg p-6 transition-all duration-300 ${tool.comingSoon
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:border-[#0a84ff] hover:bg-[#0a84ff]/5 cursor-pointer hover:scale-[1.02]'
                }`}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="text-4xl">{tool.icon}</div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{tool.name}</h3>
                  <p className="text-[#d1d5db] text-sm">{tool.description}</p>
                </div>
                {tool.comingSoon && (
                  <div className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-xs">
                    Coming Soon
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
