import { encodeAbiParameters, toBytes, toHex, type Hex } from "viem";

export function parseOwnerRepo(input: string): { owner: string; name: string } {
  const urlStr = (input || "").trim();
  const ownerRepoFromApi = urlStr.match(/\/repos\/([^/]+)\/([^/]+)\b/i);
  const ownerRepoFromGit = urlStr.match(/github\.com\/([^/]+)\/([^/]+)\b/i);
  const ownerRepoFromPlain = urlStr.match(/^([^/]+)\/([^/]+)$/);

  const owner = (ownerRepoFromApi?.[1] || ownerRepoFromGit?.[1] || ownerRepoFromPlain?.[1] || "").trim();
  const name = (ownerRepoFromApi?.[2] || ownerRepoFromGit?.[2] || ownerRepoFromPlain?.[2] || "").trim();
  return { owner, name };
}

export function normalizeZkProofData(data: any): {
  zkProof: any;
  publicOutputs: any;
} | null {
  if (!data) return null;
  if (data.success && data.data) {
    return { zkProof: data.data.zkProof, publicOutputs: data.data.publicOutputs };
  }
  if (data.zkProof && data.publicOutputs) {
    return { zkProof: data.zkProof, publicOutputs: data.publicOutputs };
  }
  return null;
}

export function extractContributionData(graphLike: unknown): { username: string; total: number } | null {
  const body = (graphLike as any)?.response?.body ?? graphLike;
  let graph: any = null;
  if (typeof body === "string") {
    try {
      graph = JSON.parse(body);
    } catch {
      return null;
    }
  } else if (body && typeof body === "object") {
    graph = body;
  }
  const userLogin = graph?.data?.user?.login;
  const mergedCount = graph?.data?.mergedPRs?.issueCount;
  if (typeof userLogin === "string" && typeof mergedCount === "number") {
    return { username: userLogin, total: mergedCount };
  }
  return null;
}

export function normalizeSealHex(zkProof: any): `0x${string}` {
  if (typeof zkProof === "string") {
    return (zkProof.startsWith("0x") ? zkProof : (`0x${zkProof}` as `0x${string}`)) as `0x${string}`;
  }
  if (zkProof?.seal) {
    const s: string = zkProof.seal;
    return (s.startsWith("0x") ? s : (`0x${s}` as `0x${string}`)) as `0x${string}`;
  }
  return toHex(toBytes(JSON.stringify(zkProof))) as `0x${string}`;
}

export function buildJournalData(publicOutputs: any, fallbackUsername: string): { journalData: Hex; username: string; contributions: bigint; repoOrUrl: string } {
  if (!publicOutputs) throw new Error("Missing public outputs");

  const notaryFp = String(publicOutputs.notaryKeyFingerprint || "");
  const notaryFpHex = (notaryFp.startsWith("0x") ? notaryFp : (`0x${notaryFp}`)) as Hex;

  const queriesHashHex = (publicOutputs.extractionHash ?? publicOutputs.queriesHash) as Hex;

  const tsSource = publicOutputs.tlsTimestamp ?? publicOutputs.timestamp;
  if (tsSource == null) throw new Error("Missing timestamp in proof");
  const ts = BigInt(tsSource);

  const values = publicOutputs.extractedValues ?? publicOutputs.values ?? [];
  const repoFromValues = values?.[0];
  const userFromValues = String(values?.[1] ?? fallbackUsername);
  const contribFromValuesRaw = values?.[2] ?? values?.[1];
  const contributions = BigInt(
    typeof contribFromValuesRaw === "number" ? contribFromValuesRaw : parseInt(String(contribFromValuesRaw ?? 0), 10)
  );

  const repoOrUrl = (publicOutputs.url as string) ?? String(repoFromValues ?? "");

  const journalData = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "string" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "string" },
      { type: "uint256" },
    ],
    [notaryFpHex, repoOrUrl, ts, queriesHashHex, userFromValues, contributions]
  );

  return { journalData, username: userFromValues, contributions, repoOrUrl };
}


