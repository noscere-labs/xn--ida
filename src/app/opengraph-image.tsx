import { ImageResponse } from 'next/og'

// Image metadata
export const alt = 'Noscere Labs - Bitcoin SV Developer Tools'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

// Image generation
export default async function Image() {
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
          backgroundImage: 'linear-gradient(45deg, #000000 0%, #0f172a 100%)',
        }}
      >
        {/* Main content container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {/* Logo/Brand name */}
          <div
            style={{
              fontSize: 80,
              fontWeight: 'bold',
              color: '#ffffff',
              marginBottom: 20,
              letterSpacing: '0.05em',
            }}
          >
            NOSCERE
          </div>
          
          {/* Gradient tagline */}
          <div
            style={{
              fontSize: 48,
              fontWeight: 'bold',
              background: 'linear-gradient(90deg, #0a84ff 0%, #a855f7 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              marginBottom: 30,
            }}
          >
            Bitcoin SV Developer Tools
          </div>
          
          {/* Description */}
          <div
            style={{
              fontSize: 28,
              color: '#d1d5db',
              textAlign: 'center',
              maxWidth: 800,
              lineHeight: 1.4,
            }}
          >
            BEEF Parsers • Merkle Tree Visualizers • Transaction Analyzers
          </div>
        </div>
        
        {/* Decorative elements */}
        <div
          style={{
            position: 'absolute',
            top: 50,
            right: 50,
            fontSize: 60,
            opacity: 0.3,
          }}
        >
          ₿
        </div>
        
        <div
          style={{
            position: 'absolute',
            bottom: 50,
            left: 50,
            fontSize: 40,
            opacity: 0.2,
          }}
        >
          🌳
        </div>
        
        <div
          style={{
            position: 'absolute',
            top: 150,
            left: 80,
            fontSize: 35,
            opacity: 0.2,
          }}
        >
          🥩
        </div>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  )
}