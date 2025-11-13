export const GitHubContributionVerifierAbi = [
  {
    type: "function",
    name: "submitContribution",
    stateMutability: "nonpayable",
    inputs: [
      { name: "journalData", type: "bytes" },
      { name: "seal", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "error",
    name: "InvalidNotaryKeyFingerprint",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidQueriesHash",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidUrl",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKProofVerificationFailed",
    inputs: [{ name: "reason", type: "string" }],
  },
  {
    type: "error",
    name: "InvalidContributions",
    inputs: [],
  },
] as const;


