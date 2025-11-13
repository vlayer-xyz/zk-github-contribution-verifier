"use client";

import React from "react";

export function ZKProofResults(props: { zkProofResult: any }) {
  const z = props.zkProofResult;
  if (!z) return null;
  return (
    <div className="space-y-4">
      {z.userData ? (
        <>
          <div className="p-6 bg-gray-900 border border-green-700 rounded-lg">
            <h3 className="text-lg font-medium text-green-400 mb-4">ZK Proof Generated Successfully</h3>
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center">
                <span className="text-green-400 text-xl">✓</span>
              </div>
              <div>
                <p className="text-white font-medium">@{z.userData.username}</p>
                <p className="text-gray-400 text-sm">Verified with Zero-Knowledge Proof</p>
              </div>
            </div>
            <div className="bg-green-600/10 border border-green-600/20 rounded-lg p-4">
              <p className="text-green-400 font-semibold text-xl">
                {z.userData.total > 0 ? `${z.userData.total} contributions` : 'Contributions'} proven with ZK
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Your contributions have been cryptographically proven using zero-knowledge proofs
              </p>
            </div>
          </div>

          <details className="bg-gray-900 border border-gray-700 rounded-lg">
            <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">
              Public Outputs
            </summary>
            <div className="p-4 pt-0 space-y-3 text-sm">
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-gray-500">Verified URL:</span>
                <span className="text-gray-300 break-all">N/A</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-gray-500">Method:</span>
                <span className="text-gray-300">N/A</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-gray-500">Timestamp:</span>
                <span className="text-gray-300">N/A</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-gray-500">Extracted Values:</span>
                <div className="text-gray-300">N/A</div>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-gray-500">Queries Hash:</span>
                <span className="text-gray-300 font-mono text-xs break-all">N/A</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-gray-500">Notary Fingerprint:</span>
                <span className="text-gray-300 font-mono text-xs break-all">N/A</span>
              </div>
            </div>
          </details>

          <details className="bg-gray-900 border border-gray-700 rounded-lg">
            <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">
              ZK Proof Data
            </summary>
            <div className="p-4 pt-0">
              <pre className="text-xs text-gray-400 overflow-x-auto break-all bg-gray-800 p-3 rounded">{JSON.stringify(z.zkProof, null, 2)}</pre>
            </div>
          </details>
        </>
      ) : (
        <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg">
          <h3 className="text-sm font-medium text-gray-300 mb-2">ZK Proof Generated</h3>
          <pre className="text-xs text-gray-400 overflow-x-auto">{JSON.stringify(z, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}


