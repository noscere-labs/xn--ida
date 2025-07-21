# Noscere Tools

A collection of blockchain analysis tools built with Next.js, featuring a BEEF (Bitcoin Extended Format) transaction parser and Merkle tree visualizer.

## Features

- **BEEF Transaction Parser**: Parse and analyse BEEF format transactions with detailed visualisation
- **Merkle Tree Visualizer**: Build and visualise Merkle trees with interactive proof verification
- Interactive transaction explorer with tabbed interface
- Merkle proof (BUMP) analysis with blockchain validation
- Transaction input/output breakdown
- Real-time parsing with error handling
- Network toggle (mainnet/testnet) for blockchain validation
- Dark mode UI with modern design

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Blockchain SDK**: @bsv/sdk for Bitcoin SV operations
- **API Integration**: WhatsOnChain API for blockchain validation
- **UI**: React 19 with client-side rendering

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd xn--ida

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the application.

### Development Commands

```bash
# Development with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

## Tools Usage

### BEEF Parser

1. Navigate to the BEEF Parser tool
2. Select network (mainnet/testnet) from the header toggle
3. Paste your BEEF transaction hex data into the input field
4. Click "Parse BEEF" to analyse the transaction
5. Explore the results through three main tabs:
   - **Overview**: Summary statistics and validation status
   - **BUMP Data**: Merkle proof analysis with blockchain validation
   - **Transactions**: Detailed transaction breakdown with inputs/outputs

### Merkle Tree Visualizer

1. Navigate to the Merkle Tree Visualizer tool
2. Input your data (one item per line) or load sample data
3. Click "Build Merkle Tree" to generate the visualization
4. Click on any leaf node to see its Merkle path proof
5. Copy any hash value using the copy buttons

### Sample Data

Both tools include sample data buttons for testing and demonstration purposes.

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout component
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── BEEFParser.tsx     # Main BEEF parsing component
│   ├── MerkleTreeVisualizer.tsx  # Merkle tree visualization
│   ├── Header.tsx         # Navigation header
│   ├── Footer.tsx         # Page footer
│   └── NetworkToggle.tsx  # Network selection component
├── services/              # API services
│   └── whatsonchain.ts    # WhatsOnChain API integration
└── resources/             # Static resources
    └── whatsonchain.json  # API documentation
```

## Features

### BEEF Validation
- Parse BEEF transactions using @bsv/sdk
- Validate BUMP proofs against blockchain data
- Network-aware validation (mainnet/testnet)
- Real-time blockchain verification via WhatsOnChain API

### Merkle Tree Features
- Interactive tree visualization with full hash display
- Click-to-reveal Merkle path proofs
- Support for various data types (hashes, text, etc.)
- Copy-to-clipboard functionality for all hash values

### UI/UX
- Responsive design with mobile support
- Dark theme with professional colour scheme
- Smooth animations and transitions
- Collapsible panels and organised tab interface

## Contributing

1. Create a feature branch from main
2. Make your changes following the established code style
3. Add tests for new functionality
4. Run linting and type checking
5. Commit changes and create a pull request

## License

Private repository - All rights reserved - Noscere 2025.