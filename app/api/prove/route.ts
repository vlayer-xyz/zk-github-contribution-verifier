import { NextRequest, NextResponse } from 'next/server';
import { verifyRepositoryAccess } from '@/app/lib/github-helpers';

// Configure max duration for Vercel (up to 90 seconds)
export const maxDuration = 160;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const graphqlUrl = 'https://api.github.com/graphql';
    const query = body.query as string | undefined;
    const variables = (body.variables as Record<string, unknown>) || {};
    const githubToken =
      (body.githubToken as string) ||
      process.env.GITHUB_TOKEN ||
      process.env.GITHUB_GRAPHQL_TOKEN ||
      '';

    console.log('prove body keys:', Object.keys(body));
    console.log('query present:', !!query, '| type:', typeof query);
    console.log(
      'githubToken present:',
      !!githubToken,
      '| source:',
      body.githubToken
        ? 'body'
        : process.env.GITHUB_TOKEN
          ? 'GITHUB_TOKEN'
          : process.env.GITHUB_GRAPHQL_TOKEN
            ? 'GITHUB_GRAPHQL_TOKEN'
            : 'none'
    );
    console.log('variables:', JSON.stringify(variables));

    if (!query || typeof query !== 'string') {
      console.error('400: missing or invalid query');
      return NextResponse.json({ error: 'Missing GraphQL query in body.query' }, { status: 400 });
    }

    if (!githubToken) {
      console.error('400: missing github token');
      return NextResponse.json(
        { error: 'Missing GitHub token. Provide githubToken in body or set GITHUB_TOKEN' },
        { status: 400 }
      );
    }

    // Extract and validate repository information
    const owner = variables.owner as string | undefined;
    const name = variables.name as string | undefined;

    console.log('owner:', owner, '| name:', name);

    if (!owner || typeof owner !== 'string' || !name || typeof name !== 'string') {
      console.error('400: missing owner or name in variables');
      return NextResponse.json(
        { error: 'Missing repository information. Provide owner and name in body.variables' },
        { status: 400 }
      );
    }

    // Verify repository access before proceeding
    const accessResult = await verifyRepositoryAccess({
      owner,
      name,
      githubToken,
    });

    if (!accessResult.success) {
      return NextResponse.json(
        { error: accessResult.error },
        { status: accessResult.statusCode || 500 }
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

    const webProverApiUrl = process.env.WEB_PROVER_API_URL;
    if (!webProverApiUrl) throw new Error('Missing WEB_PROVER_API_URL env var');

    const vlayerApiKey = process.env.WEB_PROVER_API_SECRET;
    if (!vlayerApiKey) throw new Error('Missing WEB_PROVER_API_SECRET env var');

    const baseUrl = webProverApiUrl.replace(/\/$/, '');

    console.log('Sending to vlayer API (prove):', JSON.stringify(requestBody, null, 2));
    console.log('Upstream URL being proved:', requestBody.url);
    console.log('Headers being sent:', requestBody.headers);

    const response = await fetch(`${baseUrl}/prove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vlayerApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(155000),
    });

    console.log('vlayer API response status:', response.status, response.statusText);
    console.log('vlayer API response URL:', response.url);

    const responseText = await response.text();
    console.log('vlayer API raw response (first 500 chars):', responseText.slice(0, 500));

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${responseText}`);
    }

    let data: { data: { data: unknown; version: string; meta: { notaryUrl: string } } };
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`vlayer API returned non-JSON response: ${responseText.slice(0, 200)}`);
    }

    return NextResponse.json(data.data);
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
