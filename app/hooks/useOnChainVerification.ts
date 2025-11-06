"use client";

import { useRouter } from "next/navigation";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { useState } from "react";
import { GitHubContributionVerifierAbi } from "../lib/abi";
import { buildJournalData, normalizeSealHex, parseOwnerRepo } from "../lib/utils";

export function useOnChainVerification() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const chainId = useChainId();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const [selectedChainId, setSelectedChainId] = useState<number>(Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 31337));
  const [contractAddress, setContractAddress] = useState<string>(process.env.NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS || '');

  async function verifyOnChain(params: {
    zkProofResult: { zkProof: any; publicOutputs: any } | null;
    username: string;
    inputUrl: string;
    setError: (m: string | null) => void;
  }) {
    try {
      params.setError(null);
      if (!params.zkProofResult?.zkProof || !params.zkProofResult?.publicOutputs) {
        params.setError('Generate ZK proof first');
        return;
      }
      if (!contractAddress || contractAddress.length < 10) {
        params.setError('Enter contract address');
        return;
      }
      if (!isConnected) {
        params.setError('Connect your wallet');
        return;
      }
      if (chainId !== selectedChainId && switchChain) {
        await switchChain({ chainId: selectedChainId });
      }

      const { journalData, username, contributions } = buildJournalData(params.zkProofResult.publicOutputs, params.username);
      const sealHex = normalizeSealHex(params.zkProofResult.zkProof);

      const hash = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: GitHubContributionVerifierAbi,
        functionName: 'submitContribution',
        args: [journalData, sealHex],
        chainId: selectedChainId,
      });

      // build repo name for redirect
      const values = params.zkProofResult.publicOutputs?.extractedValues ?? [];
      let repoForRedirect = String(values?.[0] ?? '');
      if (!repoForRedirect) {
        const { owner, name } = parseOwnerRepo(params.inputUrl);
        if (owner && name) repoForRedirect = `${owner}/${name}`;
      }

      const q = new URLSearchParams({
        handle: username,
        chainId: String(selectedChainId),
        reponame: repoForRedirect,
        contributions: String(contributions),
        txHash: hash,
      });
      router.push(`/success?${q.toString()}`);
    } catch (e: any) {
      params.setError(e?.shortMessage || e?.message || 'On-chain verification failed');
    }
  }

  return {
    // wallet state
    address, isConnected, isConnecting, isSwitching, isWriting,
    connect: () => connect({ connector: injected() }),
    disconnect,
    chainId,
    // form state
    selectedChainId, setSelectedChainId,
    contractAddress, setContractAddress,
    // action
    verifyOnChain,
  } as const;
}


