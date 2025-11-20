"use client";

import { useRouter } from "next/navigation";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect, useMemo, useState } from "react";
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
  const [isVerifying, setIsVerifying] = useState(false);

  const needsSwitch = useMemo(() => isConnected && chainId !== selectedChainId, [isConnected, chainId, selectedChainId]);

  const requestSwitch = async (targetChainId?: number) => {
    const goalId = targetChainId ?? selectedChainId;
    if (switchChain && isConnected && chainId !== goalId) {
      await switchChain({ chainId: goalId });
    }
  };

  useEffect(() => {
    if (isConnected && chainId !== selectedChainId && switchChain) {
      try {
        switchChain({ chainId: selectedChainId });
      } catch {
      }
    }
  }, [isConnected, selectedChainId, chainId, switchChain]);

  useEffect(() => {
    if (contractAddress && contractAddress.length > 0) return;
    const envAddress = getContractAddressFromEnv(selectedChainId);
    if (envAddress) {
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
      setIsVerifying(true);
      params.setError(null);
      if (!params.zkProofResult?.zkProof || !params.zkProofResult?.journalDataAbi) {
        params.setError('Generate ZK proof first');
        setIsVerifying(false);
        return;
      }
      if (!contractAddress || contractAddress.length < 10) {
        params.setError('Enter contract address');
        setIsVerifying(false);
        return;
      }
      if (!isConnected) {
        params.setError('Connect your wallet');
        setIsVerifying(false);
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
        setIsVerifying(false);
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
      setIsVerifying(false);
    }
  }

  return {
    address, isConnected, isConnecting, isSwitching, isWriting, isVerifying,
    connect: () => connect({ connector: injected() }),
    disconnect,
    chainId,
    needsSwitch,
    requestSwitch,
    selectedChainId, setSelectedChainId,
    contractAddress, setContractAddress,
    verifyOnChain,
  } as const;
}


