"use client";

import { useState, useEffect } from "react";
import MerkleTreeVisualizer from "../components/MerkleTreeVisualizer";
import TxParser from "../components/TxParser";
import TxWalker from "../components/TxWalker";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { Network } from "../services/whatsonchain";
import BEEFParser from "../components/BEEFParser";

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  comingSoon?: boolean;
}

const tools: Tool[] = [
  {
    id: "beef-parser",
    name: "BEEF Parser",
    description: "Parse and analyse BEEF transactions",
    icon: "🥩",
  },
  {
    id: "merkle-tree",
    name: "Merkle Tree Visualizer",
    description: "Visualize and verify Merkle tree structures",
    icon: "🌳",
  },
  {
    id: "bitcoin-tx-parser",
    name: "Bitcoin Transaction Parser",
    description: "Parse and breakdown standard Bitcoin transactions",
    icon: "₿",
  },
  {
    id: "tx-walker",
    name: "Transaction Walker",
    description:
      "Navigate through transaction graphs by exploring inputs and outputs",
    icon: "🚶‍♂️",
  },
];

// Tool metadata configuration for dynamic Open Graph updates
const toolMetadata = {
  "beef-parser": {
    title: "BEEF Parser - Bitcoin SV Transaction Analysis | Noscere Labs",
    description: "Parse and analyze BEEF (Background Evaluation Extended Format) transactions on the Bitcoin SV blockchain. Validate transaction bundles and explore blockchain data.",
    ogTitle: "BEEF Parser - Bitcoin SV Developer Tool",
    ogDescription: "Parse and analyze BEEF transactions on Bitcoin SV with real-time blockchain validation and merkle path verification.",
  },
  "merkle-tree": {
    title: "Merkle Tree Visualizer - Bitcoin SV Tool | Noscere Labs", 
    description: "Visualize and verify Merkle tree structures with interactive proof generation. Build merkle trees and generate cryptographic proofs for Bitcoin SV development.",
    ogTitle: "Merkle Tree Visualizer - Bitcoin SV Developer Tool",
    ogDescription: "Visualize and verify Merkle tree structures with interactive proof generation for Bitcoin SV blockchain development.",
  },
  "bitcoin-tx-parser": {
    title: "Bitcoin Transaction Parser - BSV Analysis Tool | Noscere Labs",
    description: "Parse and breakdown standard Bitcoin SV transactions. Analyze inputs, outputs, scripts, and transaction structure in detail.",
    ogTitle: "Bitcoin Transaction Parser - BSV Analysis Tool", 
    ogDescription: "Parse and analyze Bitcoin SV transactions with detailed breakdown of inputs, outputs, and script analysis.",
  },
  "tx-walker": {
    title: "Transaction Walker - Bitcoin SV Graph Explorer | Noscere Labs",
    description: "Navigate through Bitcoin SV transaction graphs by exploring inputs and outputs. Trace transaction flows and analyze blockchain connections.",
    ogTitle: "Transaction Walker - Bitcoin SV Graph Explorer",
    ogDescription: "Navigate through Bitcoin SV transaction graphs and trace blockchain connections with interactive exploration tools.",
  },
};

export default function Home() {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [network, setNetwork] = useState<Network>("main");

  // Update document metadata when tool changes
  useEffect(() => {
    if (selectedTool && toolMetadata[selectedTool as keyof typeof toolMetadata]) {
      const meta = toolMetadata[selectedTool as keyof typeof toolMetadata];
      const networkSuffix = network === "test" ? " (Testnet)" : " (Mainnet)";
      
      document.title = meta.title;
      
      // Update meta description
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', meta.description + networkSuffix);
      }
      
      // Update Open Graph meta tags
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', meta.ogTitle + networkSuffix);
      }
      
      const ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) {
        ogDescription.setAttribute('content', meta.ogDescription + networkSuffix);
      }
      
      // Update Twitter meta tags
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      if (twitterTitle) {
        twitterTitle.setAttribute('content', meta.ogTitle + networkSuffix);
      }
      
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      if (twitterDescription) {
        twitterDescription.setAttribute('content', meta.ogDescription + networkSuffix);
      }
    } else {
      // Reset to default metadata
      document.title = "Noscere Labs";
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', 'Bitcoin SV developer tools and blockchain analysis utilities');
      }
    }
  }, [selectedTool, network]);

  const handleToolSelect = (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (tool?.comingSoon) {
      return;
    }
    setSelectedTool(toolId);
  };

  const handleBackToHome = () => {
    setSelectedTool(null);
  };

  if (selectedTool === "beef-parser") {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex flex-col">
        <Header
          breadcrumbs={[
            {
              label: "Tools",
              href: "#",
              onClick: handleBackToHome,
            },
            { label: "BEEF Parser" },
          ]}
          showNetworkToggle={true}
          network={network}
          onNetworkChange={setNetwork}
        />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
          <BEEFParser network={network} />
        </main>

        <Footer />
      </div>
    );
  }

  if (selectedTool === "merkle-tree") {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex flex-col">
        <Header
          breadcrumbs={[
            {
              label: "Tools",
              href: "#",
              onClick: handleBackToHome,
            },
            { label: "Merkle Tree Visualizer" },
          ]}
          showNetworkToggle={true}
          network={network}
          onNetworkChange={setNetwork}
        />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
          <MerkleTreeVisualizer network={network} />
        </main>

        <Footer />
      </div>
    );
  }

  if (selectedTool === "bitcoin-tx-parser") {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex flex-col">
        <Header
          breadcrumbs={[
            {
              label: "Tools",
              href: "#",
              onClick: handleBackToHome,
            },
            { label: "Bitcoin Transaction Parser" },
          ]}
          showNetworkToggle={true}
          network={network}
          onNetworkChange={setNetwork}
        />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
          <TxParser network={network} />
        </main>

        <Footer />
      </div>
    );
  }

  if (selectedTool === "tx-walker") {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex flex-col">
        <Header
          breadcrumbs={[
            {
              label: "Tools",
              href: "#",
              onClick: handleBackToHome,
            },
            { label: "Transaction Walker" },
          ]}
          showNetworkToggle={true}
          network={network}
          onNetworkChange={setNetwork}
        />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
          <TxWalker network={network} />
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
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
            A collection of powerful tools for Bitcoin SV development and
            analysis
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {tools.map((tool) => (
            <div
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className={`bg-[#0f172a] border border-gray-700 rounded-lg p-6 transition-all duration-300 ${
                tool.comingSoon
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:border-[#0a84ff] hover:bg-[#0a84ff]/5 cursor-pointer hover:scale-[1.02]"
              }`}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="text-4xl">
                  {tool.icon.startsWith('/') ? (
                    <img src={tool.icon} alt={tool.name} className="w-12 h-12 object-contain" />
                  ) : (
                    tool.icon
                  )}
                </div>
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
