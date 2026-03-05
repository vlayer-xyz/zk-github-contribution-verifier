import { decodeAbiParameters, type Hex } from 'viem';

export function parseOwnerRepo(input: string): { owner: string; name: string } {
  const urlStr = (input || '').trim();
  const ownerRepoFromApi = urlStr.match(/\/repos\/([^/]+)\/([^/]+)\b/i);
  const ownerRepoFromGit = urlStr.match(/github\.com\/([^/]+)\/([^/]+)\b/i);
  const ownerRepoFromPlain = urlStr.match(/^([^/]+)\/([^/]+)$/);

  const owner = (
    ownerRepoFromApi?.[1] ||
    ownerRepoFromGit?.[1] ||
    ownerRepoFromPlain?.[1] ||
    ''
  ).trim();
  const name = (
    ownerRepoFromApi?.[2] ||
    ownerRepoFromGit?.[2] ||
    ownerRepoFromPlain?.[2] ||
    ''
  ).trim();
  return { owner, name };
}

export function extractContributionData(
  graphLike: unknown
): { username: string; total: number } | null {
  const root = graphLike as any;

  // Collect possible locations of the original GraphQL response body
  const candidateBodies: unknown[] = [];

  if (root?.response?.body != null) candidateBodies.push(root.response.body);
  if (root?.data?.response?.body != null) candidateBodies.push(root.data.response.body);
  if (root?.data?.responseBody != null) candidateBodies.push(root.data.responseBody);

  // Also consider the whole objects as fallbacks
  candidateBodies.push(root);
  if (root?.data) candidateBodies.push(root.data);

  for (const body of candidateBodies) {
    let graph: any = null;

    if (typeof body === 'string') {
      try {
        graph = JSON.parse(body);
      } catch {
        continue;
      }
    } else if (body && typeof body === 'object') {
      graph = body;
    } else {
      continue;
    }

    const userLogin = graph?.data?.user?.login;
    const mergedRaw =
      graph?.data?.mergedPRs?.issueCount ??
      graph?.data?.mergedPRs?.totalCount ??
      graph?.data?.mergedPrs?.issueCount ??
      graph?.data?.mergedPrs?.totalCount;

    if (typeof userLogin === 'string') {
      if (typeof mergedRaw === 'number') {
        return { username: userLogin, total: mergedRaw };
      }
      if (typeof mergedRaw === 'string') {
        const parsed = Number(mergedRaw);
        if (!Number.isNaN(parsed)) {
          return { username: userLogin, total: parsed };
        }
      }
    }
  }

  return null;
}

/**
 * Decode journalDataAbi from the zk-prover-server to extract public outputs
 * Format: (bytes32 notaryKeyFingerprint, string method, string url, uint256 tlsTimestamp, bytes32 extractionHash, string repo, string username, uint256 contributions)
 */
export function decodeJournalData(journalDataAbi: Hex) {
  try {
    const decoded = decodeAbiParameters(
      [
        { type: 'bytes32', name: 'notaryKeyFingerprint' },
        { type: 'string', name: 'method' },
        { type: 'string', name: 'url' },
        { type: 'uint256', name: 'tlsTimestamp' },
        { type: 'bytes32', name: 'extractionHash' },
        { type: 'string', name: 'repo' },
        { type: 'string', name: 'username' },
        { type: 'uint256', name: 'contributions' },
      ],
      journalDataAbi
    );

    return {
      notaryKeyFingerprint: decoded[0] as Hex,
      method: decoded[1] as string,
      url: decoded[2] as string,
      tlsTimestamp: Number(decoded[3]),
      extractionHash: decoded[4] as Hex,
      repo: decoded[5] as string,
      username: decoded[6] as string,
      contributions: decoded[7] as bigint,
    };
  } catch (error) {
    console.error('Failed to decode journalDataAbi:', error);
    throw new Error('Invalid journalDataAbi format');
  }
}
