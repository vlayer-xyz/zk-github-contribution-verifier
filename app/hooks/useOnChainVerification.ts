"use client";

import { useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect, useMemo, useState } from "react";
import { GitHubContributionVerifierAbi } from "../lib/abi";
import { parseOwnerRepo } from "../lib/utils";
import { anvil } from "../lib/chains";
import { baseSepolia, optimismSepolia, sepolia } from "viem/chains";
import { decodeErrorResult, type Hex } from "viem";

export function useOnChainVerification() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const chainId = useChainId();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const publicClient = usePublicClient();

  const [selectedChainId, setSelectedChainId] = useState<number>(
    Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 31337)
  );
  const [contractAddress, setContractAddress] = useState<string>(
    process.env.NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS || ""
  );

  const needsSwitch = useMemo(
    () => isConnected && chainId !== selectedChainId,
    [isConnected, chainId, selectedChainId]
  );

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
    let envAddress = "";
    if (selectedChainId === anvil.id)
      envAddress = process.env.NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS || "";
    else if (selectedChainId === sepolia.id)
      envAddress = process.env.NEXT_PUBLIC_SEPOLIA_CONTRACT_ADDRESS || "";
    else if (selectedChainId === baseSepolia.id)
      envAddress = process.env.NEXT_PUBLIC_BASE_SEPOLIA_CONTRACT_ADDRESS || "";
    else if (selectedChainId === optimismSepolia.id)
      envAddress = process.env.NEXT_PUBLIC_OP_SEPOLIA_CONTRACT_ADDRESS || "";
    if (envAddress) setContractAddress(envAddress);
  }, [selectedChainId, contractAddress]);

  async function verifyOnChain(params: {
    zkProofResult: {
      zkProof: any;
      journalDataAbi: string;
    } | null;
    username: string;
    inputUrl: string;
    setError: (m: string | null) => void;
  }) {
    try {
      params.setError(null);

      console.log("verifyOnChain called with:", params.zkProofResult);

      if (!params.zkProofResult) {
        params.setError("Generate ZK proof first (result is null)");
        return;
      }
      if (!params.zkProofResult.zkProof) {
        params.setError("zkProof missing from result");
        return;
      }
      if (!params.zkProofResult.journalDataAbi) {
        params.setError("journalDataAbi not found in proof result");
        return;
      }
      if (!contractAddress || contractAddress.length < 10) {
        params.setError("Enter contract address");
        return;
      }
      if (!isConnected) {
        params.setError("Connect your wallet");
        return;
      }
      if (chainId !== selectedChainId && switchChain) {
        await switchChain({ chainId: selectedChainId });
      }

      const journalData = params.zkProofResult.journalDataAbi;
      const sealHex = params.zkProofResult.zkProof;

      // Use fallback values since publicOutputs is no longer available
      const username = params.username;
      const contributions = "N/A";
      const { owner, name } = parseOwnerRepo(params.inputUrl);
      const repoForRedirect = (owner && name) ? `${owner}/${name}` : "";

      // Submit the transaction
      const hash = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: GitHubContributionVerifierAbi,
        functionName: "submitContribution",
        args: [journalData as `0x${string}`, sealHex as `0x${string}`],
        chainId: selectedChainId,
      });

      // Wait for the transaction to be mined
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Check if transaction reverted
      if (receipt.status === "reverted") {
        // Transaction reverted - simulate to get the revert reason
        try {
          await publicClient.simulateContract({
            address: contractAddress as `0x${string}`,
            abi: GitHubContributionVerifierAbi,
            functionName: "submitContribution",
            args: [journalData as `0x${string}`, sealHex as `0x${string}`],
            account: address,
          });
          // If simulation succeeds, we don't have detailed error info
          throw new Error("Transaction reverted on-chain");
        } catch (simError: any) {
          // Re-throw the simulation error which should contain revert data
          throw simError;
        }
      }

      // Success - redirect to success page
      const q = new URLSearchParams({
        handle: username,
        chainId: String(selectedChainId),
        reponame: repoForRedirect,
        contributions: contributions,
        txHash: hash,
      });
      router.push(`/success?${q.toString()}`);
    } catch (e: any) {
      // Try to decode contract error
      let errorMessage = "On-chain verification failed";
      
      const revertData = extractRevertData(e);
      if (revertData) {
        try {
          const decodedError = decodeErrorResult({
            abi: GitHubContributionVerifierAbi,
            data: revertData,
          }) as any;
          
          if (decodedError?.errorName) {
            switch (decodedError.errorName) {
              case "InvalidNotaryKeyFingerprint":
                errorMessage = "Invalid notary key fingerprint";
                break;
              case "InvalidQueriesHash":
                errorMessage = "Invalid queries hash";
                break;
              case "InvalidUrl":
                errorMessage = "Invalid URL";
                break;
              case "ZKProofVerificationFailed":
                errorMessage = `ZK proof verification failed: ${decodedError.args?.[0] || "Unknown reason"}`;
                break;
              case "InvalidContributions":
                errorMessage = "Invalid contributions count";
                break;
              default:
                errorMessage = `Contract error: ${decodedError.errorName}`;
            }
          }
        } catch {
          // Failed to decode, use generic message
        }
      }
      
      // Fallback to error message from exception
      if (errorMessage === "On-chain verification failed") {
        errorMessage = e?.shortMessage || e?.message || errorMessage;
      }
      
      params.setError(errorMessage);
    }
  }

  function extractRevertData(error: any): Hex | undefined {
    if (error?.data?.data) return error.data.data as Hex;
    if (typeof error?.data === 'string' && error.data.startsWith('0x')) return error.data as Hex;
    if (error?.cause?.data?.data) return error.cause.data.data as Hex;
    if (typeof error?.cause?.data === 'string' && error.cause.data.startsWith('0x')) return error.cause.data as Hex;
    
    if (typeof error?.walk === 'function') {
      let revertData: Hex | undefined;
      error.walk((err: any) => {
        if (err?.data && typeof err.data === 'string' && err.data.startsWith('0x')) {
          revertData = err.data as Hex;
          return false;
        }
      });
      return revertData;
    }
    
    return undefined;
  }

  return {
    // wallet state
    address,
    isConnected,
    isConnecting,
    isSwitching,
    isWriting,
    connect: () => connect({ connector: injected() }),
    disconnect,
    chainId,
    needsSwitch,
    requestSwitch,
    // form state
    selectedChainId,
    setSelectedChainId,
    contractAddress,
    setContractAddress,
    // action
    verifyOnChain,
  } as const;
}
