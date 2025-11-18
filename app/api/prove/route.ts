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

    // Extract and validate repository information
    const owner = variables.owner as string | undefined;
    const name = variables.name as string | undefined;

    if (!owner || typeof owner !== 'string' || !name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Missing repository information. Provide owner and name in body.variables' },
        { status: 400 }
      );
    }

    // Verify repository access before proceeding
    try {
      const repoCheckUrl = `https://api.github.com/repos/${owner}/${name}`;
      console.log(`Verifying repository access: ${repoCheckUrl}`);
      
      const repoCheckResponse = await fetch(repoCheckUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'User-Agent': 'zk-github-contribution-verifier',
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (repoCheckResponse.status === 404) {
        return NextResponse.json(
          { error: `Repository ${owner}/${name} not found or access denied` },
          { status: 403 }
        );
      }

      if (repoCheckResponse.status === 403) {
        const errorText = await repoCheckResponse.text().catch(() => 'Forbidden');
        console.error('GitHub API 403 response:', errorText);
        return NextResponse.json(
          { error: `GitHub token does not have read access to repository ${owner}/${name}` },
          { status: 403 }
        );
      }

      if (repoCheckResponse.status === 401) {
        return NextResponse.json(
          { error: 'Invalid or expired GitHub token' },
          { status: 401 }
        );
      }

      if (!repoCheckResponse.ok) {
        const errorText = await repoCheckResponse.text().catch(() => 'Unknown error');
        console.error(`GitHub API error (${repoCheckResponse.status}):`, errorText);
        return NextResponse.json(
          { error: `Failed to verify repository access: ${errorText}` },
          { status: 500 }
        );
      }

      // 200 OK - token has read access, proceed
      console.log(`Repository access verified for ${owner}/${name}`);
    } catch (error) {
      console.error('Error verifying repository access:', error);
      // If it's a network error, we might want to proceed anyway or fail
      // For now, we'll fail to be safe
      return NextResponse.json(
        { error: `Failed to verify repository access: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
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

    const baseUrl = (process.env.WEB_PROVER_API_URL || 'https://web-prover.vlayer.xyz/api/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/prove`, {
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
      console.error('vlayer API error response:', errorText);
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
