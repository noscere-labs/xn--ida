import { NextRequest, NextResponse } from 'next/server';

interface WhatsOnChainRequest {
  endpoint: string;
  network: 'main' | 'test';
  method?: 'GET' | 'POST';
  data?: unknown;
}

let lastRequestTime = 0;
const rateLimitDelay = 350; // 0.35 seconds as per API requirements

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < rateLimitDelay) {
    const waitTime = rateLimitDelay - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

export async function POST(request: NextRequest) {
  try {
    const body: WhatsOnChainRequest = await request.json();
    const { endpoint, network, method = 'GET', data } = body;

    // Validate network
    if (!['main', 'test'].includes(network)) {
      return NextResponse.json(
        { error: 'Invalid network. Must be "main" or "test".' },
        { status: 400 }
      );
    }

    // Validate endpoint
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json(
        { error: 'Invalid endpoint' },
        { status: 400 }
      );
    }

    // Apply rate limiting
    await rateLimit();

    const baseUrl = `https://api.whatsonchain.com/v1/bsv/${network}`;
    const url = `${baseUrl}${endpoint}`;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WhatsOnChain-Proxy/1.0',
      },
    };

    if (method === 'POST' && data) {
      fetchOptions.body = JSON.stringify(data);
    }

    console.log(`Making request to: ${url}`);
    console.log(`Request options:`, fetchOptions);
    
    const response = await fetch(url, fetchOptions);

    // Handle different response types
    const contentType = response.headers.get('content-type');
    let responseData;

    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    console.log(`Response status: ${response.status}`);
    console.log(`Response data:`, responseData);

    // Return the response with the same status code
    return NextResponse.json(
      { 
        data: responseData,
        status: response.status,
        statusText: response.statusText
      },
      { status: response.ok ? 200 : response.status }
    );

  } catch (error) {
    console.error('WhatsOnChain proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}