"use client";

import { useRouter } from "next/navigation";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
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

  // Default to Sepolia if no env var is set (more realistic than Anvil for production use)
  const defaultChainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || sepolia.id);
  const [selectedChainId, setSelectedChainId] = useState<number>(defaultChainId);
  const [contractAddress, setContractAddress] = useState<string>(process.env.NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS || '');
  
  const publicClient = usePublicClient({ chainId: selectedChainId });

  const needsSwitch = useMemo(() => isConnected && chainId !== selectedChainId, [isConnected, chainId, selectedChainId]);

  const requestSwitch = async (targetChainId?: number) => {
    const goalId = targetChainId ?? selectedChainId;
    if (switchChain && typeof switchChain === 'function' && isConnected && chainId !== goalId) {
      try {
        const result = switchChain({ chainId: goalId });
        // Only await if it returns a Promise
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (error) {
        // User rejected or wallet cannot switch - ignore silently
        // UI will display prompt via needsSwitch
      }
    }
  };

  // Auto-attempt switch when wallet is connected and selected chain differs
  useEffect(() => {
    if (isConnected && chainId !== selectedChainId && switchChain && typeof switchChain === 'function') {
      const result = switchChain({ chainId: selectedChainId });
      // Only handle catch if it returns a Promise
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          // User rejected or wallet cannot switch; UI will display prompt via needsSwitch
        });
      }
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
      
      // Ensure we're on the correct chain before submitting
      if (chainId !== selectedChainId) {
        if (!switchChain || typeof switchChain !== 'function') {
          params.setError('Please switch your wallet to the correct network');
          return;
        }
        try {
          // Attempt to switch chains - this will wait for user approval in their wallet
          const result = switchChain({ chainId: selectedChainId });
          // Only await if it returns a Promise
          if (result && typeof result.then === 'function') {
            await result;
          }
          // Give the wallet a moment to complete the switch
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (switchError: any) {
          // User rejected the switch or it failed
          const errorMsg = switchError?.shortMessage || switchError?.message || 'Failed to switch network';
          params.setError(`Network switch required: ${errorMsg}. Please switch to the correct network and try again.`);
          return;
        }
      }

      const journalData = params.zkProofResult.journalDataAbi;
      const seal = params.zkProofResult.zkProof as `0x${string}`;

      const decoded = decodeJournalData(journalData);

      // Estimate gas and cap it at block gas limit (16,777,216 = 2^24)
      // Use 90% of block gas limit as a safe maximum
      const maxGasLimit = BigInt(15109459); // ~90% of 16,777,216
      let gasLimit: bigint | undefined;

      if (publicClient && address) {
        try {
          const estimatedGas = await publicClient.estimateContractGas({
            address: contractAddress as `0x${string}`,
            abi: GitHubContributionVerifierAbi,
            functionName: 'submitContribution',
            args: [journalData, seal],
            account: address,
          });
          // Add 20% buffer, but cap at maxGasLimit
          const bufferedGas = (estimatedGas * BigInt(120)) / BigInt(100);
          gasLimit = bufferedGas > maxGasLimit ? maxGasLimit : bufferedGas;
        } catch (estimateError) {
          // If estimation fails, use maxGasLimit as fallback
          gasLimit = maxGasLimit;
        }
      } else {
        // Fallback if publicClient not available
        gasLimit = maxGasLimit;
      }

      const hash = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: GitHubContributionVerifierAbi,
        functionName: 'submitContribution',
        args: [journalData, seal],
        chainId: selectedChainId,
        gas: gasLimit,
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


