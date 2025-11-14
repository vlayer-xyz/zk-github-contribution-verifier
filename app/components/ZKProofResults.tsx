"use client";

import React from "react";
import { decodeJournalData } from "../lib/utils";

export function ZKProofResults(props: { zkProofResult: any }) {
  const z = props.zkProofResult;
  if (!z) return null;

  let decoded = null;
  if (z.journalDataAbi) {
    try {
      decoded = decodeJournalData(z.journalDataAbi);
    } catch (error) {
      console.error("Failed to decode journalDataAbi for display:", error);
    }
  }

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
                {z.userData.total} contributions proven with ZK
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Your contributions have been cryptographically proven using zero-knowledge proofs
              </p>
            </div>
          </div>

          {decoded && (
            <details className="bg-gray-900 border border-gray-700 rounded-lg">
              <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">
                Public Outputs
              </summary>
              <div className="p-4 pt-0 space-y-3 text-sm">
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-gray-500">Verified URL:</span>
                  <span className="text-gray-300 break-all">{decoded.url}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-gray-500">Method:</span>
                  <span className="text-gray-300">{decoded.method}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-gray-500">Timestamp:</span>
                  <span className="text-gray-300">{new Date(decoded.tlsTimestamp * 1000).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-gray-500">Extracted Values:</span>
                  <div className="text-gray-300">
                    <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded mb-1">[0] Repository: {decoded.repo}</div>
                    <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded mb-1">[1] Username: {decoded.username}</div>
                    <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded">[2] Contributions: {decoded.contributions.toString()}</div>
                  </div>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-gray-500">Extraction Hash:</span>
                  <span className="text-gray-300 font-mono text-xs break-all">{decoded.extractionHash}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-gray-500">Notary Fingerprint:</span>
                  <span className="text-gray-300 font-mono text-xs break-all">{decoded.notaryKeyFingerprint}</span>
                </div>
              </div>
            </details>
          )}

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


