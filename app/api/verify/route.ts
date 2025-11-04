import { NextRequest, NextResponse } from 'next/server';

// Configure max duration for Vercel (up to 90 seconds)
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const response = await fetch('https://web-prover.vlayer.xyz/api/v1/verify', {
      method: 'POST',
      headers: {
        'x-client-id': process.env.WEB_PROVER_API_CLIENT_ID || '',
        'Authorization': 'Bearer ' + process.env.WEB_PROVER_API_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(85000) // 85 seconds (less than maxDuration)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Debug logging
    console.log('=== VLAYER VERIFICATION API RESPONSE ===');
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response data:', JSON.stringify(data, null, 2));
    console.log('=== END VLAYER RESPONSE ===');
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Verify API error:', error);
    
    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Request timed out. Verification took too long to complete. Please try again.' },
        { status: 408 }
      );
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify presentation' },
      { status: 500 }
    );
  }
}
