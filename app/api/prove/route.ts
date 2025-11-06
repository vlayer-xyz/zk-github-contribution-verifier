import { NextRequest, NextResponse } from 'next/server';

// Configure max duration for Vercel (up to 90 seconds)
export const maxDuration = 160;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const graphqlUrl = 'https://api.github.com/graphql';
    const query = body.query as string | undefined;
    const variables = (body.variables as Record<string, unknown>) || {};
    const githubToken = (body.githubToken as string) || process.env.GITHUB_TOKEN || process.env.GITHUB_GRAPHQL_TOKEN || '';

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing GraphQL query in body.query' },
        { status: 400 }
      );
    }

    if (!githubToken) {
      return NextResponse.json(
        { error: 'Missing GitHub token. Provide githubToken in body or set GITHUB_TOKEN' },
        { status: 400 }
      );
    }

    const requestBody = {
      url: graphqlUrl,
      method: 'POST',
      headers: [
        'User-Agent: zk-github-contribution-verifier',
        'Accept: application/json',
        'Content-Type: application/json',
        `Authorization: Bearer ${githubToken}`,
      ],
      body: JSON.stringify({
        query,
        variables,
      }),
    } as const;

    console.log('Sending to vlayer API (prove):', JSON.stringify(requestBody, null, 2));
    console.log('Upstream URL being proved:', requestBody.url);
    console.log('Headers being sent:', requestBody.headers);

    const response = await fetch('https://web-prover.vlayer.xyz/api/v1/prove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.WEB_PROVER_API_CLIENT_ID || '',
        'Authorization': 'Bearer ' + process.env.WEB_PROVER_API_SECRET,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vlayer API error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Prove API error:', error);
    
    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Request timed out. GitHub API took too long to respond. Please try again.' },
        { status: 408 }
      );
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to prove URL' },
      { status: 500 }
    );
  }
}
