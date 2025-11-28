import { NextRequest, NextResponse } from 'next/server';
import { fetch, RequestInit } from 'undici';

// Configure max duration for Vercel (up to 90 seconds)
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { presentation, username } = body;

    if (!presentation) {
      return NextResponse.json({ error: 'Presentation data is required' }, { status: 400 });
    }

    if (!username) {
      return NextResponse.json({ error: 'Username is required for extraction' }, { status: 400 });
    }

    // Build JMESPath queries to extract repo nameWithOwner, login and merged PRs count from GraphQL response
    const extractConfig = {
      'response.body': {
        jmespath: [`data.repository.nameWithOwner`, `data.user.login`, `data.mergedPRs.issueCount`],
      },
    };

    const requestBody = {
      presentation,
      extraction: extractConfig,
    };

    console.log('Compressing web proof for user:', username);
    console.log('Extract config:', JSON.stringify(extractConfig, null, 2));

    const zkProverUrl = process.env.ZK_PROVER_API_URL || 'https://zk-prover.vlayer.xyz/api/v0';
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.WEB_PROVER_API_CLIENT_ID || '',
        Authorization: 'Bearer ' + process.env.WEB_PROVER_API_SECRET,
      },
      body: JSON.stringify(requestBody),
      headersTimeout: 1200000,
      bodyTimeout: 1200000,
    } as RequestInit;
    const response = await fetch(`${zkProverUrl}/compress-web-proof`, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ZK Prover API error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Debug logging
    console.log('=== ZK PROOF COMPRESSION RESPONSE ===');
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    console.log('=== END ZK PROOF RESPONSE ===');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Compress API error:', error);

    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        {
          error:
            'Request timed out. ZK proof generation took too long to complete. Please try again.',
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compress web proof' },
      { status: 500 }
    );
  }
}
