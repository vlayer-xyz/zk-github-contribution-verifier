import { useMemo } from "react";
import { baseSepolia, optimismSepolia, sepolia } from "viem/chains";
import { anvil } from "../lib/chains";

export function useSupportedChains() {
  return useMemo(() => {
    // Always show all supported chains, not just ones with env vars
    // This allows users to manually enter contract addresses for any supported chain
    const chains: Array<{ id: number; name: string }> = [
      { id: sepolia.id, name: 'Sepolia' },
      { id: baseSepolia.id, name: 'Base Sepolia' },
      { id: optimismSepolia.id, name: 'OP Sepolia' },
    ];
    
    // Only include Anvil if explicitly configured (local dev)
    if (process.env.NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS) {
      chains.unshift({ id: anvil.id, name: 'Anvil (Local)' });
    }
    
    return chains;
  }, []);
}


