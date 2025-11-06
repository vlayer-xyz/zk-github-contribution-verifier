"use client";

import React from "react";

export function ActionButtons(props: {
  onProve: () => void;
  onVerify: () => void;
  onCompress: () => void;
  canAct: boolean;
  hasPresentation: boolean;
  isProving: boolean;
  isVerifying: boolean;
  isCompressing: boolean;
}) {
  const { onProve, onVerify, onCompress, canAct, hasPresentation, isProving, isVerifying, isCompressing } = props;
  return (
    <div className="space-y-4">
      <button
        onClick={onProve}
        disabled={!canAct || isProving || isVerifying || isCompressing}
        className="w-full px-6 py-3 bg-[#7235e5] hover:bg-[#5d2bc7] disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
      >
        {isProving ? 'Proving...' : 'Prove Contributions'}
      </button>

      {hasPresentation && (
        <div className="flex gap-4">
          <button
            onClick={onCompress}
            disabled={!hasPresentation || !canAct || isProving || isVerifying || isCompressing}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {isCompressing ? 'Generating ZK Proof...' : 'Generate ZK Proof'}
          </button>

          <button
            onClick={onVerify}
            disabled={!hasPresentation || !canAct || isProving || isVerifying || isCompressing}
            className="flex-1 px-6 py-3 bg-[#7235e5] hover:bg-[#5d2bc7] disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {isVerifying ? 'Verifying...' : 'Verify Proof'}
          </button>
        </div>
      )}
    </div>
  );
}


