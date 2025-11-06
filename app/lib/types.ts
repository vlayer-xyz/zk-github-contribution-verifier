export type ContributionData = {
  username: string;
  total: number;
};

export type ZKProofNormalized = {
  zkProof: any;
  publicOutputs: any;
  userData?: ContributionData | null;
};

export type ProveResult = { type: "prove"; data: any };
export type VerifyResult = { type: "verify"; data: any & { contributionData?: ContributionData } };
export type OnchainResult = { type: "onchain"; data: any };
export type PageResult = ProveResult | VerifyResult | OnchainResult;


