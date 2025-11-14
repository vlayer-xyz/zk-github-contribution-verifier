"use client";

import { useRouter } from "next/navigation";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect, useMemo, useState } from "react";
import { GitHubContributionVerifierAbi } from "../lib/abi";
import { decodeJournalData, parseOwnerRepo } from "../lib/utils";
import { anvil } from "../lib/chains";
import { baseSepolia, optimismSepolia, sepolia } from "viem/chains";

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

  const needsSwitch = useMemo(() => isConnected && chainId !== selectedChainId, [isConnected, chainId, selectedChainId]);

  const requestSwitch = async (targetChainId?: number) => {
    const goalId = targetChainId ?? selectedChainId;
    if (switchChain && isConnected && chainId !== goalId) {
      await switchChain({ chainId: goalId });
    }
  };

  // Auto-attempt switch when wallet is connected and selected chain differs
  useEffect(() => {
    if (isConnected && chainId !== selectedChainId && switchChain) {
      switchChain({ chainId: selectedChainId }).catch(() => {
        // User rejected or wallet cannot switch; UI will display prompt via needsSwitch
      });
    }
  }, [isConnected, selectedChainId, chainId, switchChain]);

  // Prefill contract address based on selected chain if empty
  useEffect(() => {
    if (contractAddress && contractAddress.length > 0) return;
    let envAddress = '';
    if (selectedChainId === anvil.id) envAddress = process.env.NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS || '';
    else if (selectedChainId === sepolia.id) envAddress = process.env.NEXT_PUBLIC_SEPOLIA_CONTRACT_ADDRESS || '';
    else if (selectedChainId === baseSepolia.id) envAddress = process.env.NEXT_PUBLIC_BASE_SEPOLIA_CONTRACT_ADDRESS || '';
    else if (selectedChainId === optimismSepolia.id) envAddress = process.env.NEXT_PUBLIC_OP_SEPOLIA_CONTRACT_ADDRESS || '';
    if (envAddress) setContractAddress(envAddress);
  }, [selectedChainId, contractAddress]);

  async function verifyOnChain(params: {
    zkProofResult: { zkProof: any; journalDataAbi: `0x${string}` } | null;
    username: string;
    inputUrl: string;
    setError: (m: string | null) => void;
  }) {
    try {
      params.setError(null);
      if (!params.zkProofResult?.zkProof || !params.zkProofResult?.journalDataAbi) {
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

      const journalData = params.zkProofResult.journalDataAbi;
      const seal = params.zkProofResult.zkProof as `0x${string}`;

      const decoded = decodeJournalData(journalData);

      const hash = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: GitHubContributionVerifierAbi,
        functionName: 'submitContribution',
        args: [journalData, seal],
        chainId: selectedChainId,
      });

      // build repo name for redirect
      let repoForRedirect = decoded.repo;
      if (!repoForRedirect) {
        const { owner, name } = parseOwnerRepo(params.inputUrl);
        if (owner && name) repoForRedirect = `${owner}/${name}`;
      }

      const q = new URLSearchParams({
        handle: decoded.username,
        chainId: String(selectedChainId),
        reponame: repoForRedirect,
        contributions: String(decoded.contributions),
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
    needsSwitch,
    requestSwitch,
    // form state
    selectedChainId, setSelectedChainId,
    contractAddress, setContractAddress,
    // action
    verifyOnChain,
  } as const;
}


