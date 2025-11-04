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
] as const;


