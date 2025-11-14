export type ContributionData = {
  username: string;
  total: number;
};

export type ZKProofNormalized = {
  zkProof: string;  // Hex string, e.g. "0x..."
  journalDataAbi: `0x${string}`;
  userData: ContributionData;
};

export type ProveResult = { type: "prove"; data: any };
export type VerifyResult = { type: "verify"; data: any & { contributionData?: ContributionData } };
export type OnchainResult = { type: "onchain"; data: any };
export type PageResult = ProveResult | VerifyResult | OnchainResult;


