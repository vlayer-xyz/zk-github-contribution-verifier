import { useMemo } from "react";
import { baseSepolia, optimismSepolia, sepolia } from "viem/chains";
import { anvil } from "../lib/chains";

export function useSupportedChains() {
  return useMemo(() => {
    const chains: Array<{ id: number; name: string }> = [];
    if (process.env.NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS) {
      chains.push({ id: anvil.id, name: 'Anvil' });
    }
    if (process.env.NEXT_PUBLIC_SEPOLIA_CONTRACT_ADDRESS) {
      chains.push({ id: sepolia.id, name: 'Sepolia' });
    }
    if (process.env.NEXT_PUBLIC_BASE_SEPOLIA_CONTRACT_ADDRESS) {
      chains.push({ id: baseSepolia.id, name: 'Base Sepolia' });
    }
    if (process.env.NEXT_PUBLIC_OP_SEPOLIA_CONTRACT_ADDRESS) {
      chains.push({ id: optimismSepolia.id, name: 'OP Sepolia' });
    }
    return chains;
  }, []);
}


