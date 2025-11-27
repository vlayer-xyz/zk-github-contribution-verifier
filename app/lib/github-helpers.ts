export interface VerifyRepositoryAccessParams {
  owner: string;
  name: string;
  githubToken: string;
}

export interface VerifyRepositoryAccessResult {
  success: boolean;
  error?: string;
  statusCode?: number;
}

export async function verifyRepositoryAccess(
  params: VerifyRepositoryAccessParams
): Promise<VerifyRepositoryAccessResult> {
  const { owner, name, githubToken } = params;

  try {
    const repoCheckUrl = `https://api.github.com/repos/${owner}/${name}`;

    const repoCheckResponse = await fetch(repoCheckUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'zk-github-contribution-verifier',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (repoCheckResponse.status === 404) {
      return {
        success: false,
        error: `Repository ${owner}/${name} not found or access denied`,
        statusCode: 403,
      };
    }

    if (repoCheckResponse.status === 403) {
      return {
        success: false,
        error: `GitHub token does not have read access to repository ${owner}/${name}`,
        statusCode: 403,
      };
    }

    if (repoCheckResponse.status === 401) {
      return {
        success: false,
        error: 'Invalid or expired GitHub token',
        statusCode: 401,
      };
    }

    if (!repoCheckResponse.ok) {
      const errorText = await repoCheckResponse.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `Failed to verify repository access: ${errorText}`,
        statusCode: 500,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to verify repository access: ${error instanceof Error ? error.message : 'Unknown error'}`,
      statusCode: 500,
    };
  }
}
