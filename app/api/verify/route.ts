import { NextRequest, NextResponse } from 'next/server';

// Configure max duration for Vercel (up to 90 seconds)
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const vlayerApiKey = process.env.VLAYER_API_GATEWAY_KEY;
    if (!vlayerApiKey) {
      return NextResponse.json(
        {
          error:
            'Missing VLAYER_API_GATEWAY_KEY. Configure this env var to reach the vlayer Web Prover API.',
        },
        { status: 500 }
      );
    }

    const webProverApiUrl = process.env.WEB_PROVER_API_URL;
    if (!webProverApiUrl) {
      return NextResponse.json(
        { error: 'Missing WEB_PROVER_API_URL. Configure this env var to reach the vlayer Web Prover API.' },
        { status: 500 }
      );
    }
    const baseUrl = webProverApiUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vlayerApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(85000), // 85 seconds (less than maxDuration)
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
