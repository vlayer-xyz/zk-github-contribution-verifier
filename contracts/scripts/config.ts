import { type Chain } from 'viem';
import { sepolia, baseSepolia, optimismSepolia, foundry } from 'viem/chains';

export interface NetworkConfig {
  chain: Chain;
  rpcUrl: string;
  contractAddress?: string;
}

export const networks: Record<string, NetworkConfig> = {
  anvil: {
    chain: (foundry as unknown as Chain),
    rpcUrl: process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545',
    contractAddress: process.env.ANVIL_CONTRACT_ADDRESS,
  },
  sepolia: {
    chain: sepolia,
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    contractAddress: process.env.SEPOLIA_CONTRACT_ADDRESS,
  },
  'base-sepolia': {
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    contractAddress: process.env.BASE_SEPOLIA_CONTRACT_ADDRESS,
  },
  opSepolia: {
    chain: optimismSepolia,
    rpcUrl: process.env.OP_SEPOLIA_RPC_URL || 'https://sepolia.optimism.io',
    contractAddress: process.env.OP_SEPOLIA_CONTRACT_ADDRESS,
  },
};

export function getNetworkConfig(networkName: string): NetworkConfig {
  const config = networks[networkName];
  if (!config) {
    throw new Error(`Unsupported network: ${networkName}. Supported networks: ${Object.keys(networks).join(', ')}`);
  }
  return config;
}
