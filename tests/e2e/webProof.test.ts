import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { GitHubContributionVerifierAbi } from '../../app/lib/abi';
import { decodeJournalData } from '../../app/lib/utils';
import { contractsDir, projectRoot } from '../helpers/env';
import { getAvailablePort, waitForServer } from '../helpers/network';
import { ManagedProcess, runCommand, startProcess, stopProcess, waitForOutput } from '../helpers/process';
const DEFAULT_ANVIL_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
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
const deploymentsPath = path.join(contractsDir, 'deployments', 'anvil.json');

describe('vlayer web proof e2e', () => {
  const ctx: {
    anvil?: ManagedProcess;
    next?: ManagedProcess;
    anvilRpcUrl?: string;
    nextPort?: number;
    contractAddress?: string;
    githubToken?: string;
    imageId?: string;
    proverEnv?: {
      baseUrl?: string;
      clientId: string;
      secret: string;
    };
    zkProverUrl?: string;
  } = {};

  beforeAll(async () => {
    const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_GRAPHQL_TOKEN;
    if (!githubToken) {
      throw new Error('Set GITHUB_TOKEN (or GITHUB_GRAPHQL_TOKEN) for the GitHub GraphQL API call');
    }
    const proverClientId = process.env.WEB_PROVER_API_CLIENT_ID;
    const proverSecret = process.env.WEB_PROVER_API_SECRET;
    if (!proverClientId || !proverSecret) {
      throw new Error('Set WEB_PROVER_API_CLIENT_ID and WEB_PROVER_API_SECRET to reach the vlayer Web Prover API');
    }

    ctx.githubToken = githubToken;
    ctx.proverEnv = {
      baseUrl: process.env.WEB_PROVER_API_URL,
      clientId: proverClientId,
      secret: proverSecret,
    };
    ctx.zkProverUrl = process.env.ZK_PROVER_API_URL || 'https://zk-prover.vlayer.xyz/api/v0';
    ctx.imageId = process.env.ZK_PROVER_GUEST_ID
    if (!ctx.imageId) {
      throw new Error('ZK_PROVER_GUEST_ID not set');
    }
    console.log('ZK_PROVER_GUEST_ID:', ctx.imageId);

    const anvilPort = await getAvailablePort();
    ctx.anvilRpcUrl = `http://127.0.0.1:${anvilPort}`;
    ctx.anvil = startProcess(
      'anvil',
      ['--host', '127.0.0.1', '--port', String(anvilPort), '--chain-id', '31337'],
      'anvil',
      { cwd: projectRoot }
    );
    await waitForOutput(ctx.anvil, /Listening on/);

    await runCommand('forge', ['build'], { cwd: contractsDir });

    await runCommand(
      'npm',
      ['run', 'deploy:anvil'],
      {
        cwd: contractsDir,
        env: {
          ...process.env,
          PRIVATE_KEY: DEFAULT_ANVIL_PRIVATE_KEY,
          NOTARY_KEY_FINGERPRINT: '0xa7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af',
          QUERIES_HASH: '0x85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c6',
          EXPECTED_URL: 'https://api.github.com/graphql',
          ANVIL_RPC_URL: ctx.anvilRpcUrl,
        },
      }
    );

    const deployment = JSON.parse(await readFile(deploymentsPath, 'utf-8'));
    ctx.contractAddress = deployment.contractAddress;

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
          WEB_PROVER_API_URL: ctx.proverEnv.baseUrl,
          WEB_PROVER_API_CLIENT_ID: ctx.proverEnv.clientId,
          WEB_PROVER_API_SECRET: ctx.proverEnv.secret,
          ZK_PROVER_API_URL: ctx.zkProverUrl,
          NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS: ctx.contractAddress,
        },
      }
    );

    await waitForOutput(ctx.next, /Ready in/i, 120_000);
    await waitForServer(`http://127.0.0.1:${ctx.nextPort}`, 60_000);
  }, 180_000);

  afterAll(async () => {
    await stopProcess(ctx.next);
    await stopProcess(ctx.anvil);
  });

  test('prove, compress, and submit contribution on-chain', async () => {
    if (!ctx.nextPort || !ctx.githubToken || !ctx.anvilRpcUrl || !ctx.contractAddress) {
      throw new Error('Test context not initialized');
    }

    const login = process.env.GITHUB_LOGIN || 'Chmarusso';
    const owner = process.env.GITHUB_REPO_OWNER || 'vlayer-xyz';
    const repoName = process.env.GITHUB_REPO_NAME || 'vlayer';
    const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {
        repository(owner: $owner, name: $name) { name nameWithOwner owner { login } }
        mergedPRs: search(type: ISSUE, query: $q) { issueCount }
        user(login: $login) { login }
      }`;

    const proveResponse = await fetch(`http://127.0.0.1:${ctx.nextPort}/api/prove`, {
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
        githubToken: ctx.githubToken,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    expect(proveResponse.status).toBe(200);
    const presentation = await proveResponse.json();
    expect(typeof presentation).toBe('object');
    expect(presentation).not.toHaveProperty('error');

    const compressResponse = await fetch(`http://127.0.0.1:${ctx.nextPort}/api/compress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presentation, username: login }),
      signal: AbortSignal.timeout(60_000),
    });
    expect(compressResponse.status).toBe(200);
    const compressionPayload = await compressResponse.json();
    
    const zkProof = compressionPayload.success ? compressionPayload.data.zkProof : compressionPayload.zkProof;
    const journalDataAbi = compressionPayload.success ? compressionPayload.data.journalDataAbi : compressionPayload.journalDataAbi;
    
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

    const configuredFoundry = {
      ...foundry,
      rpcUrls: {
        default: { http: [ctx.anvilRpcUrl] },
        public: { http: [ctx.anvilRpcUrl] },
      },
    } as const;

    const account = privateKeyToAccount(DEFAULT_ANVIL_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: configuredFoundry,
      transport: http(ctx.anvilRpcUrl),
    });
    const publicClient = createPublicClient({
      chain: configuredFoundry,
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
  });

  test('prove fails for private repo without access', async () => {
    if (!ctx.nextPort) {
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

    // Use an invalid token that doesn't have access to the repository
    const invalidToken = 'invalid_token_that_has_no_access';

    const proveResponse = await fetch(`http://127.0.0.1:${ctx.nextPort}/api/prove`, {
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

    // Expect 403 (Forbidden) or 401 (Unauthorized) status
    expect([401, 403]).toContain(proveResponse.status);
    
    const errorResponse = await proveResponse.json();
    expect(errorResponse).toHaveProperty('error');
    expect(typeof errorResponse.error).toBe('string');
    
    // Verify the error message indicates access denial
    const errorMessage = errorResponse.error.toLowerCase();
    expect(
      errorMessage.includes('access') ||
      errorMessage.includes('token') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('not found')
    ).toBe(true);
  });
});
