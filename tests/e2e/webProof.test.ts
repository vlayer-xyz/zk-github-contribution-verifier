import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { fetch as undiciFetch, Agent } from 'undici';
import { GitHubContributionVerifierAbi } from '../../app/lib/abi';
import { decodeJournalData } from '../../app/lib/utils';
import { contractsDir, projectRoot } from '../helpers/env';
import { getAvailablePort, waitForServer } from '../helpers/network';
import {
  ManagedProcess,
  runCommand,
  startProcess,
  stopProcess,
  waitForOutput,
} from '../helpers/process';

const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
});

const ZK_PROVER_API_V0_URL = 'https://zk-prover.vlayer.xyz/api/v0';
const USE_CACHED_PRESENTATION = false;
const UPDATE_CACHED_PRESENTATION = false;
const PRESENTATION_CACHE_FILE = path.join(projectRoot, 'tests', 'testdata', 'cached_presentation.json');
const CONTRIBUTIONS_GETTER_ABI = [
  {
    type: 'function',
    name: 'contributionsByRepoAndUser',
    stateMutability: 'view',
    inputs: [
      { name: 'repoNameWithOwner', type: 'string' },
      { name: 'username', type: 'string' },
    ],
    outputs: [{ name: 'contributions', type: 'uint256' }],
  },
] as const;

describe('Dev web proof (Anvil + Mock Verifier)', () => {
  const ctx: {
    anvil?: ManagedProcess;
    next?: ManagedProcess;
    anvilRpcUrl?: string;
    nextPort?: number;
    contractAddress?: string;
    githubToken?: string;
    imageId?: string;
    privateKey?: string;
    proverEnv?: {
      baseUrl?: string;
      clientId: string;
      secret: string;
    };
    zkProverUrl?: string;
  } = {};

  beforeAll(async () => {
    const { githubToken, proverClientId, proverSecret } = validateRequiredEnvVars();

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY not set - need private key with ETH for testing');
    }

    const anvilPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    ctx.githubToken = githubToken;
    ctx.privateKey = anvilPrivateKey;
    ctx.proverEnv = {
      baseUrl: process.env.WEB_PROVER_API_URL,
      clientId: proverClientId,
      secret: proverSecret,
    };
    ctx.zkProverUrl = ZK_PROVER_API_V0_URL;
    ctx.imageId = process.env.ZK_PROVER_GUEST_ID;
    if (!ctx.imageId) {
      throw new Error('ZK_PROVER_GUEST_ID not set');
    }
    console.log('ZK_PROVER_GUEST_ID:', ctx.imageId);

    // Start Anvil
    const anvilPort = await getAvailablePort();
    ctx.anvilRpcUrl = `http://127.0.0.1:${anvilPort}`;
    console.log('Starting Anvil on port:', anvilPort);

    ctx.anvil = startProcess('anvil', ['--port', String(anvilPort)], 'anvil', {});
    await waitForOutput(ctx.anvil, /Listening on/i, 30_000);
    console.log('Anvil started successfully');

    // Deploy contract to Anvil
    const deployment = await deployContract({
      network: 'anvil',
      privateKey: anvilPrivateKey,
      rpcUrl: ctx.anvilRpcUrl,
      imageId: ctx.imageId,
    });
    ctx.contractAddress = deployment.contractAddress;
    console.log('Contract deployed to Anvil at:', ctx.contractAddress);

    // Start Next.js dev server
    ctx.nextPort = await getAvailablePort();
    ctx.next = startProcess(
      'npx',
      ['--no-install', 'next', 'dev', '-H', '127.0.0.1', '-p', String(ctx.nextPort)],
      'next',
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          PORT: String(ctx.nextPort),
          WEB_PROVER_API_URL:
            process.env.WEB_PROVER_API_URL || 'https://web-prover.vlayer.xyz/api/v1',
          WEB_PROVER_API_CLIENT_ID: ctx.proverEnv.clientId,
          WEB_PROVER_API_SECRET: ctx.proverEnv.secret,
          ZK_PROVER_API_URL: ctx.zkProverUrl,
          NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS: ctx.contractAddress,
        },
      }
    );

    await waitForOutput(ctx.next, /Ready in/i, 120_000);
    await waitForServer(`http://127.0.0.1:${ctx.nextPort}`, 60_000);
    console.log('Next.js dev server started on port:', ctx.nextPort);
  }, 1_00_000);

  afterAll(async () => {
    await stopProcess(ctx.next);
    await stopProcess(ctx.anvil);

    // Clean up Next.js lock files to prevent issues with subsequent test suites
    const nextDevLockPath = path.join(projectRoot, '.next', 'dev');
    try {
      await rm(nextDevLockPath, { recursive: true, force: true });
    } catch {
      // Ignore errors during cleanup
    }
  });

  test('prove, compress, and submit contribution on-chain', async () => {
    if (
      !ctx.nextPort ||
      !ctx.githubToken ||
      !ctx.anvilRpcUrl ||
      !ctx.contractAddress ||
      !ctx.privateKey
    ) {
      throw new Error('Test context not initialized');
    }

    const login = process.env.GITHUB_LOGIN || 'Chmarusso';
    const owner = process.env.GITHUB_REPO_OWNER || 'vlayer-xyz';
    const repoName = process.env.GITHUB_REPO_NAME || 'vlayer';

    const presentation = await getOrGeneratePresentation(
      ctx.nextPort,
      ctx.githubToken,
      login,
      owner,
      repoName
    );

    expect(typeof presentation).toBe('object');
    expect(presentation).not.toHaveProperty('error');

    const compressResponse = await fetch(`http://127.0.0.1:${ctx.nextPort}/api/compress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presentation, username: login }),
      signal: AbortSignal.timeout(60_000), // 1 minute for v0 API (should be fast)
    });
    expect(compressResponse.status).toBe(200);
    const compressionPayload = await compressResponse.json();

    const zkProof = compressionPayload.success
      ? compressionPayload.data.zkProof
      : compressionPayload.zkProof;
    const journalDataAbi = compressionPayload.success
      ? compressionPayload.data.journalDataAbi
      : compressionPayload.journalDataAbi;

    if (!zkProof || !journalDataAbi) {
      throw new Error('Compression response missing zkProof or journalDataAbi');
    }

    const decoded = decodeJournalData(journalDataAbi as `0x${string}`);
    const journalData = journalDataAbi as `0x${string}`;
    const seal = zkProof as `0x${string}`;

    console.log('Decoded journal data:', {
      repo: decoded.repo,
      username: decoded.username,
      contributions: decoded.contributions.toString(),
    });
    expect(decoded.contributions).toBeGreaterThan(BigInt(0));

    const account = privateKeyToAccount(ctx.privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: anvil,
      transport: http(ctx.anvilRpcUrl),
    });
    const publicClient = createPublicClient({
      chain: anvil,
      transport: http(ctx.anvilRpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: ctx.contractAddress as `0x${string}`,
      abi: GitHubContributionVerifierAbi,
      functionName: 'submitContribution',
      args: [journalData, seal],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe('success');

    const stored = await publicClient.readContract({
      address: ctx.contractAddress as `0x${string}`,
      abi: CONTRIBUTIONS_GETTER_ABI,
      functionName: 'contributionsByRepoAndUser',
      args: [decoded.repo, decoded.username],
    });
    expect(stored).toBe(decoded.contributions);
  }, 400_000); // 6.5 minutes

  test(
    'prove fails for private repo without access',
    createPrivateRepoFailureTest(() => ctx.nextPort)
  );
});

describe('Boundless web proof (Base Sepolia + Real Verifier)', () => {
  const ctx: {
    next?: ManagedProcess;
    baseSepoliaRpcUrl?: string;
    nextPort?: number;
    contractAddress?: string;
    githubToken?: string;
    imageId?: string;
    privateKey?: string;
    proverEnv?: {
      baseUrl?: string;
      clientId: string;
      secret: string;
    };
    zkProverUrl?: string;
  } = {};

  beforeAll(async () => {
    console.log('\n=== Starting Boundless Test Suite Setup ===\n');

    const { githubToken, proverClientId, proverSecret } = validateRequiredEnvVars();

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY not set - need Base Sepolia private key with testnet ETH');
    }

    ctx.githubToken = githubToken;
    ctx.privateKey = privateKey;
    ctx.proverEnv = {
      baseUrl: process.env.WEB_PROVER_API_URL,
      clientId: proverClientId,
      secret: proverSecret,
    };

    console.log('=== Boundless Test Environment Variables ===');
    console.log('WEB_PROVER_API_URL (from env):', process.env.WEB_PROVER_API_URL);
    console.log('ZK_PROVER_API_URL (from env):', process.env.ZK_PROVER_API_URL);
    console.log('ZK_PROVER_GUEST_ID (from env):', process.env.ZK_PROVER_GUEST_ID);

    ctx.zkProverUrl = process.env.ZK_PROVER_API_URL;
    ctx.imageId = process.env.ZK_PROVER_GUEST_ID;
    if (!ctx.imageId) {
      throw new Error('ZK_PROVER_GUEST_ID not set');
    }
    console.log('ctx.zkProverUrl set to:', ctx.zkProverUrl);
    console.log('ctx.imageId set to:', ctx.imageId);
    console.log('=== End Environment Variables ===');

    ctx.baseSepoliaRpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    console.log('Base Sepolia RPC URL:', ctx.baseSepoliaRpcUrl);

    console.log('=== Deploying Contract to Base Sepolia ===');
    const deployment = await deployContract({
      network: 'base-sepolia',
      privateKey,
      rpcUrl: ctx.baseSepoliaRpcUrl,
      imageId: ctx.imageId,
    });
    ctx.contractAddress = deployment.contractAddress;
    console.log('Contract deployed successfully!');
    console.log('Contract address:', ctx.contractAddress);
    console.log('Deployment imageId:', deployment.parameters?.imageId);

    ctx.nextPort = await getAvailablePort();

    console.log('=== Starting Next.js Server ===');
    console.log('Next.js port:', ctx.nextPort);

    const nextDevLockPath = path.join(projectRoot, '.next', 'dev');
    try {
      console.log('Cleaning Next.js dev lock files...');
      await rm(nextDevLockPath, { recursive: true, force: true });
      console.log('Next.js dev lock files cleaned');
    } catch {
      console.log('No lock files to clean (this is normal)');
    }

    console.log(
      'WEB_PROVER_API_URL will be:',
      ctx.proverEnv.baseUrl || 'https://web-prover.vlayer.xyz/api/v1.0_beta'
    );
    console.log('ZK_PROVER_API_URL will be:', ctx.zkProverUrl);
    console.log('CONTRACT_ADDRESS will be:', ctx.contractAddress);

    ctx.next = startProcess(
      'npx',
      ['--no-install', 'next', 'dev', '-H', '127.0.0.1', '-p', String(ctx.nextPort)],
      'next',
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          PORT: String(ctx.nextPort),
          WEB_PROVER_API_URL:
            ctx.proverEnv.baseUrl || 'https://web-prover.vlayer.xyz/api/v1.0_beta',
          WEB_PROVER_API_CLIENT_ID: ctx.proverEnv.clientId,
          WEB_PROVER_API_SECRET: ctx.proverEnv.secret,
          ZK_PROVER_API_URL: ctx.zkProverUrl,
          NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS: ctx.contractAddress,
        },
      }
    );
    console.log('Next.js startProcess called, waiting for server...');

    await waitForOutput(ctx.next, /Ready in/i, 120_000);
    console.log('Next.js process reported "Ready"');

    await waitForServer(`http://127.0.0.1:${ctx.nextPort}`, 60_000);
    console.log('Next.js dev server started successfully on port:', ctx.nextPort);
    console.log('=== End Next.js Startup ===');
  }, 1_080_000);

  afterAll(async () => {
    await stopProcess(ctx.next);

    // Clean up Next.js lock files
    const nextDevLockPath = path.join(projectRoot, '.next', 'dev');
    try {
      await rm(nextDevLockPath, { recursive: true, force: true });
    } catch {
      // Ignore errors during cleanup
    }
  });

  test('prove, compress, and submit contribution on-chain', async () => {
    if (
      !ctx.nextPort ||
      !ctx.githubToken ||
      !ctx.baseSepoliaRpcUrl ||
      !ctx.contractAddress ||
      !ctx.privateKey
    ) {
      throw new Error('Test context not initialized');
    }

    const login = process.env.GITHUB_LOGIN || 'Chmarusso';
    const owner = process.env.GITHUB_REPO_OWNER || 'vlayer-xyz';
    const repoName = process.env.GITHUB_REPO_NAME || 'vlayer';

    const presentation = await getOrGeneratePresentation(
      ctx.nextPort,
      ctx.githubToken,
      login,
      owner,
      repoName,
      600_000
    );

    expect(typeof presentation).toBe('object');
    expect(presentation).not.toHaveProperty('error');

    // undiciFetch used cause it allows setting higher timeouts than fetch
    const agent = new Agent({
      headersTimeout: 1200000, // 20 minutes
      bodyTimeout: 1200000, // 20 minutes
    });
    const compressResponse = await undiciFetch(`http://127.0.0.1:${ctx.nextPort}/api/compress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presentation, username: login }),
      dispatcher: agent,
    });
    expect(compressResponse.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compressionPayload = (await compressResponse.json()) as any;

    const zkProof = compressionPayload.success
      ? compressionPayload.data.zkProof
      : compressionPayload.zkProof;
    const journalDataAbi = compressionPayload.success
      ? compressionPayload.data.journalDataAbi
      : compressionPayload.journalDataAbi;

    if (!zkProof || !journalDataAbi) {
      throw new Error('Compression response missing zkProof or journalDataAbi');
    }

    const decoded = decodeJournalData(journalDataAbi as `0x${string}`);
    const journalData = journalDataAbi as `0x${string}`;
    const seal = zkProof as `0x${string}`;

    console.log('Decoded journal data:', {
      repo: decoded.repo,
      username: decoded.username,
      contributions: decoded.contributions.toString(),
    });
    expect(decoded.contributions).toBeGreaterThan(BigInt(0));

    const account = privateKeyToAccount(ctx.privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(ctx.baseSepoliaRpcUrl),
    });
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(ctx.baseSepoliaRpcUrl),
    });

    console.log('Submitting to contract:', ctx.contractAddress);
    console.log('Journal data length:', journalData.length);
    console.log('Seal length:', seal.length);

    const hash = await walletClient.writeContract({
      address: ctx.contractAddress as `0x${string}`,
      abi: GitHubContributionVerifierAbi,
      functionName: 'submitContribution',
      args: [journalData, seal],
    });

    console.log('Transaction hash:', hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Transaction status:', receipt.status);
    console.log('Gas used:', receipt.gasUsed);

    expect(receipt.status).toBe('success');
  }, 1_200_000); // 20 minutes

  test(
    'prove fails for private repo without access',
    createPrivateRepoFailureTest(() => ctx.nextPort)
  );
});

function validateRequiredEnvVars() {
  const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_GRAPHQL_TOKEN;
  if (!githubToken) {
    throw new Error('Set GITHUB_TOKEN (or GITHUB_GRAPHQL_TOKEN) for the GitHub GraphQL API call');
  }
  const proverClientId = process.env.WEB_PROVER_API_CLIENT_ID;
  const proverSecret = process.env.WEB_PROVER_API_SECRET;
  if (!proverClientId || !proverSecret) {
    throw new Error(
      'Set WEB_PROVER_API_CLIENT_ID and WEB_PROVER_API_SECRET to reach the vlayer Web Prover API'
    );
  }
  return { githubToken, proverClientId, proverSecret };
}

async function getOrGeneratePresentation(
  nextPort: number,
  githubToken: string,
  login: string,
  owner: string,
  repoName: string,
  timeoutMs: number = 60_000
) {
  const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {
        repository(owner: $owner, name: $name) { name nameWithOwner owner { login } }
        mergedPRs: search(type: ISSUE, query: $q) { issueCount }
        user(login: $login) { login }
      }`;

  if (USE_CACHED_PRESENTATION && existsSync(PRESENTATION_CACHE_FILE)) {
    console.log('📂 Loading cached presentation from:', PRESENTATION_CACHE_FILE);
    const cachedData = await readFile(PRESENTATION_CACHE_FILE, 'utf-8');
    const presentation = JSON.parse(cachedData);
    console.log('✅ Loaded cached presentation successfully');
    return presentation;
  } else {
    console.log('🌐 Making live API call to prove endpoint...');
    const proveResponse = await fetch(`http://127.0.0.1:${nextPort}/api/prove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          login,
          owner,
          name: repoName,
          q: `repo:${owner}/${repoName} is:pr is:merged author:${login}`,
        },
        githubToken,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    expect(proveResponse.status).toBe(200);
    const presentation = await proveResponse.json();

    if (UPDATE_CACHED_PRESENTATION) {
      await mkdir(path.dirname(PRESENTATION_CACHE_FILE), { recursive: true });
      await writeFile(PRESENTATION_CACHE_FILE, JSON.stringify(presentation, null, 2));
      console.log('💾 Saved presentation to cache:', PRESENTATION_CACHE_FILE);
    } else {
      console.log('⏭️  Skipping cache update (UPDATE_CACHED_PRESENTATION=false)');
    }
    return presentation;
  }
}

function createPrivateRepoFailureTest(getNextPort: () => number | undefined) {
  return async () => {
    const nextPort = getNextPort();
    if (!nextPort) {
      throw new Error('Test context not initialized');
    }

    const login = process.env.GITHUB_LOGIN || 'Chmarusso';
    const owner = process.env.GITHUB_REPO_OWNER || 'vlayer-xyz';
    const repoName = process.env.GITHUB_PRIVATE_REPO_NAME || 'vouch';
    const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {
        repository(owner: $owner, name: $name) { name nameWithOwner owner { login } }
        mergedPRs: search(type: ISSUE, query: $q) { issueCount }
        user(login: $login) { login }
      }`;

    const invalidToken = 'invalid_token_that_has_no_access';

    const proveResponse = await fetch(`http://127.0.0.1:${nextPort}/api/prove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          login,
          owner,
          name: repoName,
          q: `repo:${owner}/${repoName} is:pr is:merged author:${login}`,
        },
        githubToken: invalidToken,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    expect([401, 403]).toContain(proveResponse.status);

    const errorResponse = await proveResponse.json();
    expect(errorResponse).toHaveProperty('error');
    expect(typeof errorResponse.error).toBe('string');

    const errorMessage = errorResponse.error.toLowerCase();
    console.log('Error message:', errorMessage);
    expect(errorMessage.includes('invalid or expired github token')).toBe(true);
  };
}

interface DeployContractOptions {
  network: 'anvil' | 'base-sepolia';
  privateKey: string;
  rpcUrl: string;
  imageId: string;
}

async function deployContract(options: DeployContractOptions) {
  const { network, privateKey, rpcUrl, imageId } = options;

  console.log(`Deploying to ${network}...`);
  await runCommand('forge', ['build'], { cwd: contractsDir });

  const envKey = network === 'anvil' ? 'ANVIL_RPC_URL' : 'BASE_SEPOLIA_RPC_URL';
  await runCommand('npm', ['run', 'deploy', network], {
    cwd: contractsDir,
    env: {
      ...process.env,
      PRIVATE_KEY: privateKey,
      [envKey]: rpcUrl,
      ZK_PROVER_GUEST_ID: imageId,
      NOTARY_KEY_FINGERPRINT: '0xa7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af',
      QUERIES_HASH: '0x85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c6',
      EXPECTED_URL: 'https://api.github.com/graphql',
    },
  });

  const deploymentsPath = path.join(contractsDir, 'deployments', `${network}.json`);
  const deployment = JSON.parse(await readFile(deploymentsPath, 'utf-8'));
  return deployment;
}
