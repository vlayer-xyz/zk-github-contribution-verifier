import { decodeAbiParameters, type Hex } from 'viem';

export function parseOwnerRepo(input: string): { owner: string; name: string } {
  const urlStr = (input || '').trim();
  const ownerRepoFromApi = urlStr.match(/\/repos\/([^/]+)\/([^/]+)\b/i);
  const ownerRepoFromGit = urlStr.match(/github\.com\/([^/]+)\/([^/]+)\b/i);
  const ownerRepoFromPlain = urlStr.match(/^([^/]+)\/([^/]+)$/);

  const owner = (ownerRepoFromApi?.[1] || ownerRepoFromGit?.[1] || ownerRepoFromPlain?.[1] || '').trim();
  const name = (ownerRepoFromApi?.[2] || ownerRepoFromGit?.[2] || ownerRepoFromPlain?.[2] || '').trim();
  return { owner, name };
}

export function extractContributionData(graphLike: unknown): { username: string; total: number } | null {
  const body = (graphLike as any)?.response?.body ?? graphLike;
  let graph: any = null;
  if (typeof body === 'string') {
    try {
      graph = JSON.parse(body);
    } catch {
      return null;
    }
  } else if (body && typeof body === 'object') {
    graph = body;
  }
  const userLogin = graph?.data?.user?.login;
  const mergedCount = graph?.data?.mergedPRs?.issueCount;
  if (typeof userLogin === 'string' && typeof mergedCount === 'number') {
    return { username: userLogin, total: mergedCount };
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
