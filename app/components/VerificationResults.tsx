"use client";

import React from "react";
import type { PageResult } from "../lib/types";

export function VerificationResults(props: { result: PageResult }) {
  const r = props.result;
  if (!r) return null;
  if (r.type === 'verify' && r.data?.contributionData) {
    return (
      <div className="space-y-4">
        <div className="p-6 bg-gray-900 border border-gray-700 rounded-lg">
          <h3 className="text-lg font-medium text-gray-300 mb-4">✅ Verification Successful</h3>
          <div className="mb-4">
            <p className="text-white font-medium">@{r.data.contributionData.username}</p>
            <p className="text-gray-400 text-sm">GitHub Contributor</p>
          </div>
          <div className="bg-[#7235e5]/10 border border-[#7235e5]/20 rounded-lg p-4">
            <p className="text-[#7235e5] font-semibold text-xl">{r.data.contributionData.total} contributions verified</p>
            <p className="text-gray-400 text-sm mt-1">Your contributions to this repository have been cryptographically verified</p>
          </div>
        </div>

        <details className="bg-gray-900 border border-gray-700 rounded-lg">
          <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">Full Verification Response</summary>
          <div className="p-4 pt-0">
            <pre className="text-xs text-gray-400 overflow-x-auto bg-gray-800 p-3 rounded">{JSON.stringify(r.data, null, 2)}</pre>
          </div>
        </details>
      </div>
    );
  }

  return (
    <details className="bg-gray-900 border border-gray-700 rounded-lg">
      <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">{r.type === 'prove' ? 'GitHub Contribution Proof' : 'Verification Result'}</summary>
      <div className="p-4 pt-0">
        <pre className="text-xs text-gray-400 overflow-x-auto bg-gray-800 p-3 rounded">{JSON.stringify(r.data, null, 2)}</pre>
      </div>
    </details>
  );
}


