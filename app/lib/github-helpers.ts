/**
 * GitHub API helper functions
 */

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

/**
 * Verifies that the GitHub token has read access to the specified repository.
 * 
 * @param params - Repository owner, name, and GitHub token
 * @returns Result object with success status and optional error information
 */
export async function verifyRepositoryAccess(
  params: VerifyRepositoryAccessParams
): Promise<VerifyRepositoryAccessResult> {
  const { owner, name, githubToken } = params;
  
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
      return {
        success: false,
        error: `Repository ${owner}/${name} not found or access denied`,
        statusCode: 403,
      };
    }

    if (repoCheckResponse.status === 403) {
      const errorText = await repoCheckResponse.text().catch(() => 'Forbidden');
      console.error('GitHub API 403 response:', errorText);
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
      console.error(`GitHub API error (${repoCheckResponse.status}):`, errorText);
      return {
        success: false,
        error: `Failed to verify repository access: ${errorText}`,
        statusCode: 500,
      };
    }

    // 200 OK - token has read access, proceed
    console.log(`Repository access verified for ${owner}/${name}`);
    return { success: true };
  } catch (error) {
    console.error('Error verifying repository access:', error);
    return {
      success: false,
      error: `Failed to verify repository access: ${error instanceof Error ? error.message : 'Unknown error'}`,
      statusCode: 500,
    };
  }
}

