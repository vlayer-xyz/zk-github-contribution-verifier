import { afterAll, beforeAll, describe, expect, test } from "vitest";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { GitHubContributionVerifierAbi } from "../../app/lib/abi";
import { decodeJournalData } from "../../app/lib/utils";
import { contractsDir, projectRoot } from "../helpers/env";
import { getAvailablePort, waitForServer } from "../helpers/network";
import {
  ManagedProcess,
  runCommand,
  startProcess,
  stopProcess,
  waitForOutput,
} from "../helpers/process";

// Define Anvil chain with correct chain ID (31337)
const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
  },
});

// Toggle between live API calls and cached presentations
const USE_CACHED_PRESENTATION = process.env.USE_CACHED_PRESENTATION === "true";
const CACHE_DIR = path.join(projectRoot, "tests", ".cache");
const PRESENTATION_CACHE_FILE = path.join(CACHE_DIR, "presentation.json");
const CONTRIBUTIONS_GETTER_ABI = [
  {
    type: "function",
    name: "contributionsByRepoAndUser",
    stateMutability: "view",
    inputs: [
      { name: "repoNameWithOwner", type: "string" },
      { name: "username", type: "string" },
    ],
    outputs: [{ name: "contributions", type: "uint256" }],
  },
] as const;

describe("Original web proof (Anvil + Mock Verifier)", () => {
  const anvilDeploymentsPath = path.join(
    contractsDir,
    "deployments",
    "anvil.json"
  );

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
    const githubToken =
      process.env.GITHUB_TOKEN || process.env.GITHUB_GRAPHQL_TOKEN;
    if (!githubToken) {
      throw new Error(
        "Set GITHUB_TOKEN (or GITHUB_GRAPHQL_TOKEN) for the GitHub GraphQL API call"
      );
    }
    const proverClientId = process.env.WEB_PROVER_API_CLIENT_ID;
    const proverSecret = process.env.WEB_PROVER_API_SECRET;
    if (!proverClientId || !proverSecret) {
      throw new Error(
        "Set WEB_PROVER_API_CLIENT_ID and WEB_PROVER_API_SECRET to reach the vlayer Web Prover API"
      );
    }

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(
        "PRIVATE_KEY not set - need private key with ETH for testing"
      );
    }

    // For Anvil, use the first default account which has 10000 ETH pre-funded
    const anvilPrivateKey =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    ctx.githubToken = githubToken;
    ctx.privateKey = anvilPrivateKey;
    ctx.proverEnv = {
      baseUrl: process.env.WEB_PROVER_API_URL,
      clientId: proverClientId,
      secret: proverSecret,
    };
    ctx.zkProverUrl =
      process.env.ZK_PROVER_API_URL || "https://zk-prover.vlayer.xyz/api/v0";
    ctx.imageId = process.env.ZK_PROVER_GUEST_ID;
    if (!ctx.imageId) {
      throw new Error("ZK_PROVER_GUEST_ID not set");
    }
    console.log("ZK_PROVER_GUEST_ID:", ctx.imageId);

    // Start Anvil
    const anvilPort = await getAvailablePort();
    ctx.anvilRpcUrl = `http://127.0.0.1:${anvilPort}`;
    console.log("Starting Anvil on port:", anvilPort);

    ctx.anvil = startProcess(
      "anvil",
      ["--port", String(anvilPort)],
      "anvil",
      {}
    );
    await waitForOutput(ctx.anvil, /Listening on/i, 30_000);
    console.log("Anvil started successfully");

    // Build and deploy contract to Anvil
    console.log("Building contracts...");
    await runCommand("forge", ["build"], { cwd: contractsDir });

    console.log("Deploying to Anvil...");
    await runCommand("npm", ["run", "deploy", "anvil"], {
      cwd: contractsDir,
      env: {
        ...process.env,
        ANVIL_RPC_URL: ctx.anvilRpcUrl,
        PRIVATE_KEY: anvilPrivateKey,
        ZK_PROVER_GUEST_ID: ctx.imageId,
        NOTARY_KEY_FINGERPRINT:
          "0xa7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af",
        QUERIES_HASH:
          "0x85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c6",
        EXPECTED_URL: "https://api.github.com/graphql",
      },
    });

    const deployment = JSON.parse(
      await readFile(anvilDeploymentsPath, "utf-8")
    );
    ctx.contractAddress = deployment.contractAddress;
    console.log("Contract deployed to Anvil at:", ctx.contractAddress);

    // Start Next.js dev server
    ctx.nextPort = await getAvailablePort();
    ctx.next = startProcess(
      "npx",
      [
        "--no-install",
        "next",
        "dev",
        "-H",
        "127.0.0.1",
        "-p",
        String(ctx.nextPort),
      ],
      "next",
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: "development",
          PORT: String(ctx.nextPort),
          // Use v0 API for original (non-boundless) test
          WEB_PROVER_API_URL: "https://web-prover.vlayer.xyz/api/v0",
          WEB_PROVER_API_CLIENT_ID: ctx.proverEnv.clientId,
          WEB_PROVER_API_SECRET: ctx.proverEnv.secret,
          ZK_PROVER_API_URL: "http://localhost:3000/api/v0",
          NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS: ctx.contractAddress,
        },
      }
    );

    await waitForOutput(ctx.next, /Ready in/i, 120_000);
    await waitForServer(`http://127.0.0.1:${ctx.nextPort}`, 60_000);
    console.log("Next.js dev server started on port:", ctx.nextPort);
  }, 1_080_000);

  afterAll(async () => {
    await stopProcess(ctx.next);
    await stopProcess(ctx.anvil);
  });

  test("prove, compress, and submit contribution on-chain", async () => {
    if (
      !ctx.nextPort ||
      !ctx.githubToken ||
      !ctx.anvilRpcUrl ||
      !ctx.contractAddress ||
      !ctx.privateKey
    ) {
      throw new Error("Test context not initialized");
    }

    const login = process.env.GITHUB_LOGIN || "Chmarusso";
    const owner = process.env.GITHUB_REPO_OWNER || "vlayer-xyz";
    const repoName = process.env.GITHUB_REPO_NAME || "vlayer";
    const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {
        repository(owner: $owner, name: $name) { name nameWithOwner owner { login } }
        mergedPRs: search(type: ISSUE, query: $q) { issueCount }
        user(login: $login) { login }
      }`;

    let presentation;

    if (USE_CACHED_PRESENTATION && existsSync(PRESENTATION_CACHE_FILE)) {
      // Load cached presentation
      console.log(
        "📂 Loading cached presentation from:",
        PRESENTATION_CACHE_FILE
      );
      const cachedData = await readFile(PRESENTATION_CACHE_FILE, "utf-8");
      presentation = JSON.parse(cachedData);
      console.log("✅ Loaded cached presentation successfully");
    } else {
      // Make live API call
      console.log("🌐 Making live API call to prove endpoint...");
      const proveResponse = await fetch(
        `http://127.0.0.1:${ctx.nextPort}/api/prove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        }
      );
      expect(proveResponse.status).toBe(200);
      presentation = await proveResponse.json();

      // Save to cache for future use
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(
        PRESENTATION_CACHE_FILE,
        JSON.stringify(presentation, null, 2)
      );
      console.log("💾 Saved presentation to cache:", PRESENTATION_CACHE_FILE);
    }

    expect(typeof presentation).toBe("object");
    expect(presentation).not.toHaveProperty("error");

    const compressResponse = await fetch(
      `http://127.0.0.1:${ctx.nextPort}/api/compress`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentation, username: login }),
        signal: AbortSignal.timeout(60_000), // 1 minute for v0 API (should be fast)
      }
    );
    expect(compressResponse.status).toBe(200);
    const compressionPayload = await compressResponse.json();

    const zkProof = compressionPayload.success
      ? compressionPayload.data.zkProof
      : compressionPayload.zkProof;
    const journalDataAbi = compressionPayload.success
      ? compressionPayload.data.journalDataAbi
      : compressionPayload.journalDataAbi;

    if (!zkProof || !journalDataAbi) {
      throw new Error("Compression response missing zkProof or journalDataAbi");
    }

    const decoded = decodeJournalData(journalDataAbi as `0x${string}`);
    const journalData = journalDataAbi as `0x${string}`;
    const seal = zkProof as `0x${string}`;

    console.log("Decoded journal data:", {
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
      functionName: "submitContribution",
      args: [journalData, seal],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const stored = await publicClient.readContract({
      address: ctx.contractAddress as `0x${string}`,
      abi: CONTRIBUTIONS_GETTER_ABI,
      functionName: "contributionsByRepoAndUser",
      args: [decoded.repo, decoded.username],
    });
    expect(stored).toBe(decoded.contributions);
  }, 300_000); // 5 minutes timeout for the test

  test("prove fails for private repo without access", async () => {
    if (!ctx.nextPort) {
      throw new Error("Test context not initialized");
    }

    const login = process.env.GITHUB_LOGIN || "Chmarusso";
    const owner = process.env.GITHUB_REPO_OWNER || "vlayer-xyz";
    const repoName = process.env.GITHUB_PRIVATE_REPO_NAME || "vouch";
    const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {
        repository(owner: $owner, name: $name) { name nameWithOwner owner { login } }
        mergedPRs: search(type: ISSUE, query: $q) { issueCount }
        user(login: $login) { login }
      }`;

    const invalidToken = "invalid_token_that_has_no_access";

    const proveResponse = await fetch(
      `http://127.0.0.1:${ctx.nextPort}/api/prove`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      }
    );

    expect([401, 403]).toContain(proveResponse.status);

    const errorResponse = await proveResponse.json();
    expect(errorResponse).toHaveProperty("error");
    expect(typeof errorResponse.error).toBe("string");

    const errorMessage = errorResponse.error.toLowerCase();
    console.log("Error message:", errorMessage);
    expect(errorMessage.includes("invalid or expired github token")).toBe(true);
  });
});

describe("Boundless web proof (Base Sepolia + Real Verifier)", () => {
  const baseSepoliaDeploymentsPath = path.join(
    contractsDir,
    "deployments",
    "base-sepolia.json"
  );

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
    const githubToken =
      process.env.GITHUB_TOKEN || process.env.GITHUB_GRAPHQL_TOKEN;
    if (!githubToken) {
      throw new Error(
        "Set GITHUB_TOKEN (or GITHUB_GRAPHQL_TOKEN) for the GitHub GraphQL API call"
      );
    }
    const proverClientId = process.env.WEB_PROVER_API_CLIENT_ID;
    const proverSecret = process.env.WEB_PROVER_API_SECRET;
    if (!proverClientId || !proverSecret) {
      throw new Error(
        "Set WEB_PROVER_API_CLIENT_ID and WEB_PROVER_API_SECRET to reach the vlayer Web Prover API"
      );
    }

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(
        "PRIVATE_KEY not set - need Base Sepolia private key with testnet ETH"
      );
    }

    ctx.githubToken = githubToken;
    ctx.privateKey = privateKey;
    ctx.proverEnv = {
      baseUrl: process.env.WEB_PROVER_API_URL,
      clientId: proverClientId,
      secret: proverSecret,
    };
    ctx.zkProverUrl =
      process.env.ZK_PROVER_API_URL || "https://zk-prover.vlayer.xyz/api/v0";
    ctx.imageId = process.env.ZK_PROVER_GUEST_ID;
    if (!ctx.imageId) {
      throw new Error("ZK_PROVER_GUEST_ID not set");
    }
    console.log("ZK_PROVER_GUEST_ID:", ctx.imageId);

    // Use Base Sepolia RPC
    ctx.baseSepoliaRpcUrl =
      process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
    console.log("Base Sepolia RPC URL:", ctx.baseSepoliaRpcUrl);

    // Check if contract is already deployed, if not deploy it
    if (!existsSync(baseSepoliaDeploymentsPath)) {
      console.log("No existing deployment found, deploying to Base Sepolia...");
      await runCommand("forge", ["build"], { cwd: contractsDir });

      await runCommand("npm", ["run", "deploy", "base-sepolia"], {
        cwd: contractsDir,
        env: {
          ...process.env,
          PRIVATE_KEY: privateKey,
          BASE_SEPOLIA_RPC_URL: ctx.baseSepoliaRpcUrl,
          ZK_PROVER_GUEST_ID: ctx.imageId,
          NOTARY_KEY_FINGERPRINT:
            "0xa7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af",
          QUERIES_HASH:
            "0x85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c6",
          EXPECTED_URL: "https://api.github.com/graphql",
        },
      });
    } else {
      console.log("Using existing Base Sepolia deployment");
    }

    const deployment = JSON.parse(
      await readFile(baseSepoliaDeploymentsPath, "utf-8")
    );
    ctx.contractAddress = deployment.contractAddress;
    console.log("Contract address:", ctx.contractAddress);

    ctx.nextPort = await getAvailablePort();
    ctx.next = startProcess(
      "npx",
      [
        "--no-install",
        "next",
        "dev",
        "-H",
        "127.0.0.1",
        "-p",
        String(ctx.nextPort),
      ],
      "next",
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: "development",
          PORT: String(ctx.nextPort),
          // Use v1.0_beta API for boundless test
          WEB_PROVER_API_URL:
            ctx.proverEnv.baseUrl ||
            "https://web-prover.vlayer.xyz/api/v1.0_beta",
          WEB_PROVER_API_CLIENT_ID: ctx.proverEnv.clientId,
          WEB_PROVER_API_SECRET: ctx.proverEnv.secret,
          ZK_PROVER_API_URL:
            ctx.zkProverUrl || "https://zk-prover.vlayer.xyz/api/v0",
          NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS: ctx.contractAddress,
        },
      }
    );

    await waitForOutput(ctx.next, /Ready in/i, 120_000);
    await waitForServer(`http://127.0.0.1:${ctx.nextPort}`, 60_000);
  }, 1_080_000);

  afterAll(async () => {
    await stopProcess(ctx.next);
  });

  test("prove, compress, and submit contribution on-chain", async () => {
    if (
      !ctx.nextPort ||
      !ctx.githubToken ||
      !ctx.baseSepoliaRpcUrl ||
      !ctx.contractAddress ||
      !ctx.privateKey
    ) {
      throw new Error("Test context not initialized");
    }

    const login = process.env.GITHUB_LOGIN || "Chmarusso";
    const owner = process.env.GITHUB_REPO_OWNER || "vlayer-xyz";
    const repoName = process.env.GITHUB_REPO_NAME || "vlayer";
    const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {
        repository(owner: $owner, name: $name) { name nameWithOwner owner { login } }
        mergedPRs: search(type: ISSUE, query: $q) { issueCount }
        user(login: $login) { login }
      }`;

    let presentation;

    if (USE_CACHED_PRESENTATION && existsSync(PRESENTATION_CACHE_FILE)) {
      // Load cached presentation
      console.log(
        "📂 Loading cached presentation from:",
        PRESENTATION_CACHE_FILE
      );
      const cachedData = await readFile(PRESENTATION_CACHE_FILE, "utf-8");
      presentation = JSON.parse(cachedData);
      console.log("✅ Loaded cached presentation successfully");
    } else {
      // Make live API call
      console.log("🌐 Making live API call to prove endpoint...");
      const proveResponse = await fetch(
        `http://127.0.0.1:${ctx.nextPort}/api/prove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        }
      );
      expect(proveResponse.status).toBe(200);
      presentation = await proveResponse.json();

      // Save to cache for future use
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(
        PRESENTATION_CACHE_FILE,
        JSON.stringify(presentation, null, 2)
      );
      console.log("💾 Saved presentation to cache:", PRESENTATION_CACHE_FILE);
    }

    expect(typeof presentation).toBe("object");
    expect(presentation).not.toHaveProperty("error");

    const compressResponse = await fetch(
      `http://127.0.0.1:${ctx.nextPort}/api/compress`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentation, username: login }),
        signal: AbortSignal.timeout(1_000_000), // 1000 seconds for boundless test
      }
    );
    expect(compressResponse.status).toBe(200);
    const compressionPayload = await compressResponse.json();

    const zkProof = compressionPayload.success
      ? compressionPayload.data.zkProof
      : compressionPayload.zkProof;
    const journalDataAbi = compressionPayload.success
      ? compressionPayload.data.journalDataAbi
      : compressionPayload.journalDataAbi;

    if (!zkProof || !journalDataAbi) {
      throw new Error("Compression response missing zkProof or journalDataAbi");
    }

    const decoded = decodeJournalData(journalDataAbi as `0x${string}`);
    const journalData = journalDataAbi as `0x${string}`;
    const seal = zkProof as `0x${string}`;

    console.log("Decoded journal data:", {
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

    const hash = await walletClient.writeContract({
      address: ctx.contractAddress as `0x${string}`,
      abi: GitHubContributionVerifierAbi,
      functionName: "submitContribution",
      args: [journalData, seal],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const stored = await publicClient.readContract({
      address: ctx.contractAddress as `0x${string}`,
      abi: CONTRIBUTIONS_GETTER_ABI,
      functionName: "contributionsByRepoAndUser",
      args: [decoded.repo, decoded.username],
    });
    expect(stored).toBe(decoded.contributions);
  }, 1_200_000); // 20 minutes timeout for the boundless test (ZK proof takes 3-6 minutes)

  test("prove fails for private repo without access", async () => {
    if (!ctx.nextPort) {
      throw new Error("Test context not initialized");
    }

    const login = process.env.GITHUB_LOGIN || "Chmarusso";
    const owner = process.env.GITHUB_REPO_OWNER || "vlayer-xyz";
    const repoName = process.env.GITHUB_PRIVATE_REPO_NAME || "vouch";
    const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {
        repository(owner: $owner, name: $name) { name nameWithOwner owner { login } }
        mergedPRs: search(type: ISSUE, query: $q) { issueCount }
        user(login: $login) { login }
      }`;

    const invalidToken = "invalid_token_that_has_no_access";

    const proveResponse = await fetch(
      `http://127.0.0.1:${ctx.nextPort}/api/prove`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      }
    );

    expect([401, 403]).toContain(proveResponse.status);

    const errorResponse = await proveResponse.json();
    expect(errorResponse).toHaveProperty("error");
    expect(typeof errorResponse.error).toBe("string");

    const errorMessage = errorResponse.error.toLowerCase();
    console.log("Error message:", errorMessage);
    expect(errorMessage.includes("invalid or expired github token")).toBe(true);
  });
});
