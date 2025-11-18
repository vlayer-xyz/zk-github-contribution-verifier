"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { baseSepolia, optimismSepolia, sepolia } from "viem/chains";

function getExplorerBaseUrl(chainId: number): string | null {
  const byId: Record<number, { url: string } | undefined> = {
    [sepolia.id]: sepolia.blockExplorers?.default,
    [baseSepolia.id]: baseSepolia.blockExplorers?.default,
    [optimismSepolia.id]: optimismSepolia.blockExplorers?.default,
  } as const;
  return byId[chainId]?.url ?? null; // anvil and unknown chains return null
}

function shortenHash(hash: string): string {
  if (!hash || hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function getErrorDescription(errorName: string): string {
  const descriptions: Record<string, string> = {
    InvalidNotaryKeyFingerprint: "The notary key fingerprint in the proof doesn't match the expected value. This usually means the proof was generated with a different notary configuration.",
    InvalidQueriesHash: "The queries hash in the proof doesn't match the expected value. This means the extraction queries used don't match what the contract expects.",
    InvalidUrl: "The URL in the proof doesn't match the expected GitHub API endpoint pattern configured in the contract.",
    InvalidContributions: "The contribution count is invalid (either 0 or exceeds the maximum allowed value of 1,000,000).",
    ZKProofVerificationFailed: "The ZK proof verification failed. This could mean the proof is invalid, corrupted, or doesn't match the expected program image.",
    UnknownError: "The transaction reverted for an unknown reason. Check the transaction on the block explorer for more details.",
  };
  return descriptions[errorName] || descriptions.UnknownError;
}

function ErrorContent() {
  const router = useRouter();
  const params = useSearchParams();

  const txHash = params.get("txHash") || "";
  const chainId = Number(params.get("chainId") || "0");
  const error = params.get("error") || "Transaction reverted";
  const errorName = params.get("errorName") || "UnknownError";
  const handle = params.get("handle") || "";
  const reponame = params.get("reponame") || "";
  const contributions = params.get("contributions") || "";
  const contractAddress = params.get("contractAddress") || "";

  const explorerUrl = useMemo(() => {
    const base = getExplorerBaseUrl(chainId);
    if (!base || !txHash) return null;
    return `${base.replace(/\/$/, "")}/tx/${txHash}`;
  }, [chainId, txHash]);

  const contractExplorerUrl = useMemo(() => {
    const base = getExplorerBaseUrl(chainId);
    if (!base || !contractAddress) return null;
    return `${base.replace(/\/$/, "")}/address/${contractAddress}`;
  }, [chainId, contractAddress]);

  const errorDescription = useMemo(() => getErrorDescription(errorName), [errorName]);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="container mx-auto px-4 py-16 max-w-3xl relative">
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-medium text-red-400">Transaction Reverted</h1>
          <p className="text-gray-400 mt-2">Your transaction was reverted on-chain.</p>
        </div>

        <div className="space-y-4">
          {/* Error Details Card */}
          <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-lg">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-red-400 mb-2">Error Information</h2>
              <div className="bg-black/50 p-3 rounded border border-red-500/20">
                <div className="font-mono text-sm">
                  <div className="text-red-300 break-words whitespace-pre-wrap">{error}</div>
                  {errorName !== "UnknownError" && (
                    <div className="text-gray-400 mt-1">Error Type: {errorName}</div>
                  )}
                </div>
              </div>
            </div>
            <p className="text-gray-300 text-sm">{errorDescription}</p>
          </div>

          {/* Transaction Details Card */}
          <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Transaction Details</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Transaction Hash</span>
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#7235e5] hover:underline font-mono"
                  >
                    {shortenHash(txHash)}
                  </a>
                ) : (
                  <span className="font-mono text-gray-300">{shortenHash(txHash)}</span>
                )}
              </div>

              {contractAddress && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Contract Address</span>
                  {contractExplorerUrl ? (
                    <a
                      href={contractExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#7235e5] hover:underline font-mono"
                    >
                      {shortenHash(contractAddress)}
                    </a>
                  ) : (
                    <span className="font-mono text-gray-300">{shortenHash(contractAddress)}</span>
                  )}
                </div>
              )}

              {chainId > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Chain ID</span>
                  <span className="text-gray-300">{chainId}</span>
                </div>
              )}

              {handle && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Username</span>
                  <span className="text-gray-300">@{handle}</span>
                </div>
              )}

              {reponame && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Repository</span>
                  <span className="text-gray-300">{reponame}</span>
                </div>
              )}

              {contributions && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Contributions</span>
                  <span className="text-gray-300">{contributions}</span>
                </div>
              )}
            </div>
          </div>

          {/* Debugging Tips */}
          <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Debugging Tips</h2>
            <ul className="space-y-2 text-sm text-gray-300 list-disc list-inside">
              <li>Check the transaction on the block explorer to see the full revert reason</li>
              <li>Verify that your ZK proof was generated correctly</li>
              <li>Ensure the contract address matches the network you're using</li>
              <li>Verify that the proof data matches the contract's expected format</li>
              <li>Check that you're using the correct chain/network</li>
              {errorName === "InvalidNotaryKeyFingerprint" && (
                <li className="text-yellow-400">The notary configuration may have changed. Regenerate your proof with the current notary settings.</li>
              )}
              {errorName === "InvalidQueriesHash" && (
                <li className="text-yellow-400">The extraction queries may have changed. Ensure you're using the correct queries that match the contract configuration.</li>
              )}
              {errorName === "ZKProofVerificationFailed" && (
                <li className="text-yellow-400">The ZK proof may be corrupted or invalid. Try regenerating the proof.</li>
              )}
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700"
            >
              Back to main
            </button>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded bg-[#7235e5] hover:bg-[#5d2bc7] text-white"
              >
                View on explorer
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>}>
      <ErrorContent />
    </Suspense>
  );
}

