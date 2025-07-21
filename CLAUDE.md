# Intent

This site is going to be used to host various tools. The first of which will be a BEEF transaction visualiser.

# Styling

## Colour Palette

The colour scheme is dark-mode dominant, using blacks and navies for backgrounds, whites for text, and vibrant blues/purples for accents and gradients. This creates a professional, futuristic feel.

Primary Background: #000000 (Pure black) – Used for the main body and hero section.
Secondary Background (Footer): #0f172a (Dark navy/slate) – Provides subtle depth in footers or secondary sections.
Accent Blue (Logo, Buttons): #0a84ff (Bright blue) – For logos, calls-to-action (e.g., "Get Started" button), and highlights.
Gradient (Hero Text): Linear gradient from #0a84ff (blue) to #a855f7 (purple) – Applied to large headings for visual interest; direction: 90deg (left to right).
Text Primary: #ffffff (White) – Default for body text, headings, and navigation.
Text Secondary: #d1d5db (Light gray) – For subtitles or less prominent text (inferred for hierarchy, though not explicitly shown).

## Font Family

Primary: 'Arial', sans-serif (fallback to system fonts like Helvetica or -apple-system for cross-platform consistency). The site appears to use a modern sans-serif; if custom, it resembles Inter or Roboto (verify with dev tools on the live site).
Headings:
H1: 36px, bold (weight: 700), line-height: 1.1, gradient text.
H2/H3: 24-18px, bold, white text.
Body Text:
Paragraphs/Subtitles: 16-18px, regular (weight: 400), line-height: 1.5, white text.
Navigation/Links: 16px, regular, white text; hover: underline or subtle colour shift to #0a84ff.
Footer Text: 14px, regular, white text for descriptions and links.
Usage Guidelines:

## Text styling

Uppercase for logos/brands (e.g., "NOSCERE").
Ensure high contrast (WCAG AA compliant).
No italics or decorative fonts; keep minimalistic.

## Layout and Structure

The layout is responsive, using flexbox for alignment, with generous padding for a spacious feel.

Overall Structure:
Header: Fixed or sticky, flex layout (logo left, nav centre, button right).
Hero Section: Full-width, centered content, 100-200px padding top/bottom.
Main Content: A simple vertical stack.

Padding:
Sections: 50-100px top/bottom (hero: 100px).
Header/Footer: 20-50px horizontal.
Buttons: 10px vertical, 20px horizontal.
Margins:
Elements: 10-20px between nav items, 20px below headings.
Hero text: 20px between title and subtitle.
Units: Use rem or px for consistency (e.g., 1rem = 16px base).
Guidelines: Follow an 8px grid system (multiples of 8 for margins/padding) for alignment.

## Buttons and Interactive Elements

Primary Button ("Get Started"): Background #0a84ff, text #ffffff, padding 10px 20px, border-radius 5px, no border.
Hover: Background #3ea6ff (lighter blue), cursor: pointer.
Usage: Calls-to-action; keep concise text.
Links: White text, no underline by default; hover: underline or colour change.

Guidelines:
Icons should be minimal; avoid heavy illustrations. Ensure scalable (SVG preferred). 7. Other Visual Elements
Backgrounds: Solid dark colours; no images or patterns shown.
Transitions/Animations: Subtle (not shown, but suggest 0.3s ease for button hovers).
Borders/Shadows: None used; design is flat and borderless for modernity.
Accessibility: High contrast, alt text for icons/images, semantic HTML

# APIs

In order to gather information about the blockchain to validate merklepaths etc, you need a source of blockchain information.
Read the documentation for WhatsOnChain's API. The following JSON describes whatsonchains api where we can interrogate the blockchain for information our tools might need. Please note that there is call throttling so please delay each call by 0.35 seconds. Please refer to: resources/whatsonchain.json

Bear in mind there are two networks we can interrogate. main and test.

# Project Architecture & Maintenance

## Core Components

### BEEF Parser (`src/components/BEEFParser.tsx`)
- **Purpose**: Parse and validate BEEF (Background Evaluation Extended Format) transactions
- **Key Features**: 
  - Collapsible panel with smooth animations (500ms duration)
  - Network toggle integration (main/test networks)
  - Real-time blockchain validation via WhatsOnChain API
  - Full hash display with copy-to-clipboard functionality
  - Interactive overview boxes for tab navigation
- **State Management**: Uses React hooks for parser state, validation status, and network selection
- **Performance**: Hardware-accelerated animations with `transform3d` and `willChange`

### Merkle Tree Visualizer (`src/components/MerkleTreeVisualizer.tsx`)
- **Purpose**: Build and visualise Merkle trees with interactive proof verification
- **Key Features**:
  - Oblong nodes (180x80px) for full hash visibility
  - Centered tree positioning with proper spacing
  - Clickable leaf nodes for merkle path generation
  - Copy functionality for all hash values
  - Multi-line hash display in nodes
- **Rendering**: SVG-based with separated clickable areas and visual elements
- **Interaction**: Click leaf nodes to generate and display merkle path proofs

### WhatsOnChain Service (`src/services/whatsonchain.ts`)
- **Purpose**: Interface with WhatsOnChain API for blockchain validation
- **Features**:
  - Rate limiting (0.35s delays) as per API requirements
  - Network switching (main/test)
  - BUMP validation against actual blockchain data
  - Merkle path verification using BSV SDK
- **Architecture**: Service class with async methods and proper error handling

## Development Guidelines

### Hash Display Standards
- **NEVER truncate hashes** - always display full values
- Use the `HashDisplay` component for consistent styling and copy functionality
- Monospace fonts required for all hash data
- Include copy-to-clipboard on hover for all hash displays

### Animation Performance
- Target 60fps for all animations (minimum 30fps)
- Use `transform3d()` and `willChange` for hardware acceleration
- Keep animation durations between 200-500ms for responsiveness
- Use `ease-in-out` timing for natural motion

### Component Structure
- Follow the established pattern: Header → Content → Footer
- Use collapsible panels for complex data (follow BEEF parser pattern)
- Include loading states and error handling for all async operations
- Maintain consistent spacing using 8px grid system

### Network Integration
- Always include network toggle in header for blockchain-related tools
- Pass network state from page level to components
- Reset validation states when network changes
- Include network indicator in validation status displays

### Validation & Error Handling
- Show real-time validation status with visual indicators (✓/✗/loading)
- Include detailed error messages for troubleshooting
- Provide "Validate" buttons for manual verification
- Display validation results in collapsible sections

## Code Quality Standards

### TypeScript
- Use strict typing for all components and services
- Define interfaces for all data structures (BumpData, TreeNode, etc.)
- Avoid `any` types - use proper type definitions
- Include optional properties where appropriate

### Styling Consistency
- Use Tailwind classes following the established colour palette
- Maintain hover effects: `hover:scale-[1.02]` for cards, `hover:bg-[color]/20` for backgrounds
- Consistent border radius: `rounded-lg` (8px) for cards, `rounded` (4px) for small elements
- Use established colour scheme: `#0a84ff` (blue), `#a855f7` (purple), `#0f172a` (navy)

### Performance Best Practices
- Implement rate limiting for API calls (0.35s for WhatsOnChain)
- Use React.memo for expensive rendering operations
- Debounce user inputs where appropriate
- Lazy load heavy components

## Testing & Validation

### Sample Data Testing
- Always test with the provided sample BEEF data
- Verify hash displays show complete values
- Test network switching functionality
- Validate copy-to-clipboard works across all hash displays

### Cross-Network Testing
- Test on both mainnet and testnet
- Verify API responses handle network differences correctly
- Ensure validation works across both networks
- Test error handling for network timeouts

## Future Enhancement Guidelines

### Adding New Tools
- Follow the established Header/Content/Footer pattern
- Include network toggle if blockchain-related
- Implement smooth animations for state changes
- Add copy functionality for all data outputs
- Use consistent styling and spacing

### API Integration
- Always implement rate limiting for external APIs
- Include proper error handling and user feedback
- Use loading states for async operations
- Cache responses where appropriate

### UI/UX Improvements
- Maintain 60fps animation targets
- Include visual feedback for all user interactions
- Use consistent colour coding across tools
- Implement accessibility best practices (ARIA labels, keyboard navigation)

## Deployment Considerations

### Build Process
- Run `npm run build` to verify all components compile correctly
- Test in production mode to catch any runtime issues
- Verify all animations perform smoothly in production build

### Browser Compatibility
- Test SVG rendering across different browsers
- Verify CSS animations work consistently
- Test copy-to-clipboard functionality on various devices

Remember: This project emphasizes complete transparency of blockchain data. Never hide or truncate important information - always provide full visibility with professional presentation and easy copying functionality.
