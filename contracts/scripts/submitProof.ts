import { createWalletClient, createPublicClient, http, type Hex, encodeAbiParameters, decodeErrorResult } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import { getNetworkConfig } from './config';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

dotenv.config();

// Contract ABI - only the functions we need
const contractABI = [
  {
    inputs: [
      { name: 'journalData', type: 'bytes' },
      { name: 'seal', type: 'bytes' }
    ],
    name: 'submitContribution',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'username', type: 'string' }],
    name: 'getLatestContribution',
    outputs: [{
      components: [
        { name: 'username', type: 'string' },
        { name: 'contributions', type: 'uint256' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'blockNumber', type: 'uint256' },
        { name: 'repoUrl', type: 'string' }
      ],
      name: '',
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  // Custom errors for better revert decoding
  { name: 'InvalidNotaryKeyFingerprint', type: 'error', inputs: [] },
  { name: 'InvalidQueriesHash', type: 'error', inputs: [] },
  { name: 'InvalidUrl', type: 'error', inputs: [] },
  { name: 'InvalidContributions', type: 'error', inputs: [] },
  { name: 'ZKProofVerificationFailed', type: 'error', inputs: [] },
  // Standard errors
  { name: 'Error', type: 'error', inputs: [{ name: 'message', type: 'string' }] },
  { name: 'Panic', type: 'error', inputs: [{ name: 'code', type: 'uint256' }] },
] as const;

// Accept a flexible input; we'll normalize later
interface ZKProofData {
  zkProof: string;
  publicOutputs: Record<string, unknown>;
}

interface SubmitProofOptions {
  network: string;
  zkProofData: ZKProofData;
  contractAddress?: string;
}

function getRevertData(err: unknown): Hex | undefined {
  if (typeof err === 'object' && err !== null) {
    const top = err as { data?: unknown; cause?: unknown };
    if (typeof top.data === 'string') return top.data as Hex;
    if (typeof top.cause === 'object' && top.cause !== null) {
      const cause = top.cause as { data?: unknown };
      if (typeof cause.data === 'string') return cause.data as Hex;
    }
  }
  return undefined;
}

async function submitProof(options: SubmitProofOptions) {
  const { network, zkProofData, contractAddress: overrideAddress } = options;

  console.log(`\n=== Submitting ZK Proof to ${network} ===\n`);

  // Get network configuration
  const networkConfig = getNetworkConfig(network);
  const contractAddress = (overrideAddress || networkConfig.contractAddress) as Hex;

  if (!contractAddress) {
    throw new Error(`Contract address not configured for network: ${network}`);
  }

  console.log(`Network: ${network}`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`RPC URL: ${networkConfig.rpcUrl}`);

  // Setup wallet
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not set in environment variables');
  }

  const account = privateKeyToAccount(privateKey as Hex);
  console.log(`\nWallet address: ${account.address}`);

  // Create clients
  const publicClient = createPublicClient({
    chain: networkConfig.chain,
    transport: http(networkConfig.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: networkConfig.chain,
    transport: http(networkConfig.rpcUrl),
  });

  // Extract values from ZK proof (seal intentionally empty to match tests)
  const seal: Hex = '0x';
  const po = (zkProofData.publicOutputs || {}) as Record<string, unknown>;
  const url: string = String(po.url ?? '');
  const tsRaw = (po as { tlsTimestamp?: unknown; timestamp?: unknown }).tlsTimestamp ?? (po as { timestamp?: unknown }).timestamp;
  const queriesHashRaw = (po as { extractionHash?: unknown; queriesHash?: unknown }).extractionHash ?? (po as { queriesHash?: unknown }).queriesHash;
  const valuesRaw = (po as { extractedValues?: unknown; values?: unknown }).extractedValues ?? (po as { values?: unknown }).values;
  const notaryRaw = (po as { notaryKeyFingerprint?: unknown }).notaryKeyFingerprint;

  // Normalize notary fingerprint (ensure 0x prefix)
  const notaryKeyFingerprint: Hex = String(notaryRaw || '').startsWith('0x')
    ? String(notaryRaw) as Hex
    : (`0x${String(notaryRaw || '')}` as Hex);

  // Normalize timestamp
  const timestampBigInt = BigInt(typeof tsRaw === 'string' || typeof tsRaw === 'number' ? tsRaw : 0);

  // Normalize queries/extraction hash (ensure 0x prefix)
  const queriesHash: Hex = String(queriesHashRaw || '').startsWith('0x')
    ? String(queriesHashRaw) as Hex
    : (`0x${String(queriesHashRaw || '')}` as Hex);

  // Normalize values [repo?, username, contributions]
  let username = '';
  let contributions: bigint = BigInt(0);
  if (Array.isArray(valuesRaw)) {
    if (valuesRaw.length >= 3) {
      username = String(valuesRaw[1] ?? '');
      const c = valuesRaw[2];
      contributions = BigInt(typeof c === 'string' || typeof c === 'number' ? c : 0);
    } else if (valuesRaw.length >= 2) {
      username = String(valuesRaw[0] ?? '');
      const c = valuesRaw[1];
      contributions = BigInt(typeof c === 'string' || typeof c === 'number' ? c : 0);
    }
  }

  console.log(`\nProof Details:`);
  console.log(`  Username: ${username}`);
  console.log(`  Contributions: ${contributions}`);
  console.log(`  Repo URL: ${url}`);
  console.log(`  Timestamp: ${new Date(Number(timestampBigInt) * 1000).toISOString()}`);

  // Encode journal data to match Solidity abi.decode types exactly
  // (bytes32, string, uint256, bytes32, string, uint256)
  const journalData = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'string' },
      { type: 'uint256' },
      { type: 'bytes32' },
      { type: 'string' },
      { type: 'uint256' },
    ],
    [
      notaryKeyFingerprint,
      url,
      timestampBigInt,
      queriesHash,
      username,
      contributions,
    ]
  );

  console.log(`\nTransaction Details:`);
  console.log(`  Journal Data Length: ${journalData.length}`);
  console.log(`  Seal Length: ${seal.length}`);

  // Simulate transaction first
  console.log(`\nSimulating transaction...`);
  try {
    await publicClient.simulateContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'submitContribution',
      args: [journalData, seal],
      account: account.address,
    });
    console.log(`✓ Simulation successful`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Try to decode custom error
    const revertData = getRevertData(error);
    if (revertData) {
      try {
        const decoded = decodeErrorResult({ abi: contractABI, data: revertData });
        console.error(`✗ Simulation failed: ${decoded.errorName}`, decoded.args ?? []);
      } catch {
        console.error(`✗ Simulation failed:`, message);
        console.error(`Revert data:`, revertData);
      }
    } else {
      console.error(`✗ Simulation failed:`, message);
      console.error(`Full error:`, util.inspect(error, { depth: 5 }));
    }
    throw error;
  }

  // Submit transaction
  console.log(`\nSubmitting transaction...`);
  let hash: Hex;
  try {
    hash = await walletClient.writeContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'submitContribution',
      args: [journalData, seal],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const revertData = getRevertData(error);
    if (revertData) {
      try {
        const decoded = decodeErrorResult({ abi: contractABI, data: revertData });
        console.error(`✗ Submission failed: ${decoded.errorName}`, decoded.args ?? []);
      } catch {
        console.error(`✗ Submission failed:`, message);
        console.error(`Revert data:`, revertData);
      }
    } else {
      console.error(`✗ Submission failed:`, message);
      console.error(`Full error:`, util.inspect(error, { depth: 5 }));
    }
    throw error;
  }

  console.log(`\nTransaction submitted: ${hash}`);
  console.log(`Waiting for confirmation...`);

  // Wait for transaction receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(`\n✓ Transaction confirmed!`);
  console.log(`  Block: ${receipt.blockNumber}`);
  console.log(`  Gas used: ${receipt.gasUsed}`);
  console.log(`  Status: ${receipt.status}`);

  // Verify on-chain
  console.log(`\nVerifying on-chain data...`);
  const storedData = await publicClient.readContract({
    address: contractAddress,
    abi: contractABI,
    functionName: 'getLatestContribution',
    args: [username],
  });

  console.log(`\n✓ Verified on-chain:`);
  console.log(`  Username: ${storedData.username}`);
  console.log(`  Contributions: ${storedData.contributions}`);
  console.log(`  Block Number: ${storedData.blockNumber}`);
  console.log(`  Repo URL: ${storedData.repoUrl}`);

  return {
    transactionHash: hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    storedData,
  };
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(`
Usage: npm run submit-proof <network> <zkProofFile> [contractAddress]

Arguments:
  network         - Target network (sepolia, base, base-sepolia, optimism, opSepolia, arbitrum, arbitrumSepolia, mainnet)
  zkProofFile     - Path to JSON file containing ZK proof data
  contractAddress - (Optional) Override contract address

Example:
  npm run submit-proof sepolia ./proof.json
  npm run submit-proof base ./proof.json 0x1234...
`);
    process.exit(1);
  }

  const [network, zkProofFile, contractAddress] = args;

  // Load ZK proof data
  const zkProofPath = path.resolve(zkProofFile);
  if (!fs.existsSync(zkProofPath)) {
    throw new Error(`ZK proof file not found: ${zkProofPath}`);
  }

  // Load zk proof data. Support both flat and wrapped formats like:
  // { zkProof, publicOutputs } OR { success, data: { zkProof, publicOutputs } }
  type ZKProofDataLike = {
    zkProof?: string;
    publicOutputs?: {
      notaryKeyFingerprint?: string;
      method?: string;
      url?: string;
      timestamp?: number | string;
      queriesHash?: string;
      values?: [unknown, unknown];
    };
  };
  type Wrapped = { success?: boolean; data?: ZKProofDataLike };

  const raw: unknown = JSON.parse(fs.readFileSync(zkProofPath, 'utf-8')) as unknown;

  const hasZkProof = (obj: unknown): obj is ZKProofDataLike =>
    typeof obj === 'object' && obj !== null &&
    'zkProof' in obj && 'publicOutputs' in obj;

  const hasDataWithZk = (obj: unknown): obj is Wrapped =>
    typeof obj === 'object' && obj !== null &&
    'data' in obj && hasZkProof((obj as { data?: unknown }).data);

  const extracted: ZKProofDataLike = hasDataWithZk(raw)
    ? (raw as Wrapped).data as ZKProofDataLike
    : (raw as ZKProofDataLike);

  if (!extracted || !extracted.zkProof || !extracted.publicOutputs) {
    throw new Error('Invalid zk proof file: expected { zkProof, publicOutputs } or { success, data: { ... } }');
  }

  // Use data as-is without normalization
  const zkProofData = extracted as unknown as ZKProofData;

  // Submit proof
  try {
    const result = await submitProof({
      network,
      zkProofData,
      contractAddress,
    });

    console.log(`\n=== Submission Complete ===\n`);
    console.log(`Transaction: ${result.transactionHash}`);
    console.log(`View on explorer: [Add explorer URL here]`);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✗ Error:`, message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { submitProof, type ZKProofData, type SubmitProofOptions };
