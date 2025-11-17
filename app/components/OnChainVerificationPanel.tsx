"use client";

import React from "react";
import { useOnChainVerification } from "../hooks/useOnChainVerification";
import { useSupportedChains } from "../hooks/useSupportedChains";

export function OnChainVerificationPanel(props: {
  zkProofResult: { zkProof: `0x${string}`; journalDataAbi: `0x${string}` } | null;
  username: string;
  inputUrl: string;
  setError: (m: string | null) => void;
}) {
  const chains = useSupportedChains();
  const {
    address, isConnected, isConnecting, isSwitching, isWriting,
    connect, disconnect,
    chainId, needsSwitch, requestSwitch,
    selectedChainId, setSelectedChainId,
    contractAddress, setContractAddress,
    verifyOnChain,
  } = useOnChainVerification();

  return (
    <div className="space-y-4 p-4 bg-gray-900 border border-gray-700 rounded-lg">
      <h3 className="text-sm font-medium text-gray-300">On-chain verification</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Network</label>
          <select
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            value={selectedChainId}
            onChange={(e) => {
              const nextId = parseInt(e.target.value, 10);
              setSelectedChainId(nextId);
              if (isConnected && chainId !== nextId) {
                requestSwitch(nextId).catch(() => {});
              }
            }}
          >
            {chains.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Contract address</label>
          <input
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            placeholder="0x..."
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {needsSwitch && (
          <div className="text-xs text-amber-400 flex items-center gap-2">
            Wallet on wrong network.
            <button onClick={() => requestSwitch()} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded">
              Switch network
            </button>
          </div>
        )}
        <div className="flex gap-3">
        {!isConnected ? (
          <button onClick={connect} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded" disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        ) : (
          <button onClick={() => disconnect()} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded">
            Disconnect {address?.slice(0, 6)}…{address?.slice(-4)}
          </button>
        )}
        <button
          onClick={() => verifyOnChain({ zkProofResult: props.zkProofResult, username: props.username, inputUrl: props.inputUrl, setError: props.setError })}
          disabled={!isConnected || !contractAddress || isWriting || isSwitching || needsSwitch}
          className="px-4 py-2 bg-[#7235e5] hover:bg-[#5d2bc7] disabled:bg-gray-700 rounded"
        >
          {isWriting || isSwitching ? 'Submitting…' : 'Verify on-chain'}
        </button>
        </div>
      </div>
    </div>
  );
}


