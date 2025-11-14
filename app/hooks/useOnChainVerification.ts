"use client";

import { useRouter } from "next/navigation";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect, useMemo, useState } from "react";
import { decodeErrorResult } from "viem";
import { GitHubContributionVerifierAbi } from "../lib/abi";
import { decodeJournalData } from "../lib/utils";
import {
  decodeTransactionError,
  buildErrorRedirectParams,
  buildSuccessRedirectParams,
  getContractAddressFromEnv,
} from "../lib/verification-helpers";

export function useOnChainVerification() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const chainId = useChainId();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const publicClient = usePublicClient();

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
      try {
        switchChain({ chainId: selectedChainId });
      } catch {
        // User rejected or wallet cannot switch; UI will display prompt via needsSwitch
      }
    }
  }, [isConnected, selectedChainId, chainId, switchChain]);

  // Prefill contract address based on selected chain if empty
  useEffect(() => {
    if (contractAddress && contractAddress.length > 0) return;
    const envAddress = getContractAddressFromEnv(selectedChainId);
    if (envAddress) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => setContractAddress(envAddress), 0);
    }
  }, [selectedChainId, contractAddress]);

  async function verifyOnChain(params: {
    zkProofResult: { zkProof: string; journalDataAbi: `0x${string}` } | null;
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

      if (!publicClient) {
        params.setError('Public client not available');
        return;
      }

      const hash = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: GitHubContributionVerifierAbi,
        functionName: 'submitContribution',
        args: [journalData, seal],
        chainId: selectedChainId,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "reverted") {
        const { errorMessage, errorName } = await decodeTransactionError({
          publicClient,
          hash,
          contractAddress: contractAddress as `0x${string}`,
          journalData,
          seal,
          accountAddress: address!,
        });

        const queryParams = buildErrorRedirectParams({
          txHash: hash,
          chainId: selectedChainId,
          errorMessage,
          errorName,
          decoded,
          inputUrl: params.inputUrl,
          contractAddress,
        });
        router.push(`/error?${queryParams.toString()}`);
        return;
      }

      const queryParams = buildSuccessRedirectParams({
        decoded,
        chainId: selectedChainId,
        inputUrl: params.inputUrl,
        txHash: hash,
      });
      router.push(`/success?${queryParams.toString()}`);
    } catch (e: unknown) {
      const error = e as { shortMessage?: string; message?: string };
      params.setError(error?.shortMessage || error?.message || 'On-chain verification failed');
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


