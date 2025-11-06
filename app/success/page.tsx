"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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

function SuccessContent() {
  const router = useRouter();
  const params = useSearchParams();

  const handle = params.get("handle") || "";
  const chainId = Number(params.get("chainId") || "0");
  const reponame = params.get("reponame") || ""; // owner/repo
  const contributions = params.get("contributions") || "";
  const txHash = params.get("txHash") || "";

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function fetchAvatar() {
      if (!handle) return;
      try {
        setAvatarError(null);
        const res = await fetch(`https://api.github.com/users/${encodeURIComponent(handle)}`);
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        const data = await res.json();
        if (!ignore) setAvatarUrl(data?.avatar_url ?? null);
      } catch (e: any) {
        if (!ignore) setAvatarError(e?.message || "Failed to load avatar");
      }
    }
    fetchAvatar();
    return () => {
      ignore = true;
    };
  }, [handle]);

  const explorerUrl = useMemo(() => {
    const base = getExplorerBaseUrl(chainId);
    if (!base || !txHash) return null;
    return `${base.replace(/\/$/, "")}/tx/${txHash}`;
  }, [chainId, txHash]);

  const valid = handle && reponame && contributions && txHash;

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Minimal confetti */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="absolute top-[-10%] w-1.5 h-3 rounded-sm animate-confetti"
            style={{
              left: `${(i * 101) % 100}%`,
              background:
                i % 3 === 0
                  ? "#7235e5"
                  : i % 3 === 1
                  ? "#22c55e"
                  : "#eab308",
              transform: `rotate(${(i * 37) % 360}deg)`,
              animationDelay: `${(i % 6) * 0.25}s`,
              animationDuration: `${6 + (i % 5)}s`,
              opacity: 0.8,
            }}
          />
        ))}
      </div>

      <style jsx global>{`
        @keyframes confettiFall {
          0% { transform: translateY(-10vh) rotate(0deg); }
          100% { transform: translateY(110vh) rotate(380deg); }
        }
        .animate-confetti {
          animation-name: confettiFall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
      `}</style>

      <div className="container mx-auto px-4 py-16 max-w-2xl relative">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-medium">Verification Successful</h1>
          <p className="text-gray-400 mt-2">Your contribution proof was submitted on-chain.</p>
        </div>

        {!valid ? (
          <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300">
            Missing or invalid query parameters.
          </div>
        ) : (
          <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={`${handle} avatar`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-500 text-xl">@</span>
                )}
              </div>
              <div>
                <div className="text-white font-semibold">@{handle}</div>
                <div className="text-gray-400 text-sm">{reponame}</div>
                {avatarError && (
                  <div className="text-xs text-red-400 mt-1">{avatarError}</div>
                )}
              </div>
            </div>

            <div className="bg-[#7235e5]/10 border border-[#7235e5]/20 rounded-lg p-4 mb-4">
              <div className="text-[#7235e5] text-xl font-semibold">
                {contributions} contributions verified
              </div>
              <div className="text-gray-400 text-sm mt-1">Proven and recorded via smart contract.</div>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="text-gray-400">Transaction</div>
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

            <div className="mt-8 flex gap-3">
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
        )}
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>}>
      <SuccessContent />
    </Suspense>
  );
}


