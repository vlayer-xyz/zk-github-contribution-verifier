"use client";

import { useMemo, useState } from 'react';
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, useWriteContract, useReadContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { baseSepolia, sepolia, optimismSepolia } from "viem/chains";
import { anvil } from "./lib/chains";
import { encodeAbiParameters, isHex, toBytes, toHex } from "viem";
import { GitHubContributionVerifierAbi } from "./lib/abi";

export default function Home() {
  const [url, setUrl] = useState('vlayer-xyz/vlayer');
  const [githubToken, setGithubToken] = useState('');
  const [username, setUsername] = useState('');
  const [isPrivateRepo, setIsPrivateRepo] = useState(false);
  const [isProving, setIsProving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [presentation, setPresentation] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [zkProofResult, setZkProofResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string>(process.env.NEXT_PUBLIC_DEFAULT_CONTRACT_ADDRESS || '');
  const [selectedChainId, setSelectedChainId] = useState<number>(Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 31337));

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const chainId = useChainId();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const handleProve = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsProving(true);
    setError(null);
    setResult(null);

    try {
      // Parse owner/repo from the provided URL input
      const urlStr = url.trim();
      const ownerRepoFromApi = urlStr.match(/\/repos\/([^/]+)\/([^/]+)\b/i);
      const ownerRepoFromGit = urlStr.match(/github\.com\/([^/]+)\/([^/]+)\b/i);
      const ownerRepoFromPlain = urlStr.match(/^([^/]+)\/([^/]+)$/);

      const owner = (ownerRepoFromApi?.[1] || ownerRepoFromGit?.[1] || ownerRepoFromPlain?.[1] || '').trim();
      const name = (ownerRepoFromApi?.[2] || ownerRepoFromGit?.[2] || ownerRepoFromPlain?.[2] || '').trim();

      if (!owner || !name) {
        throw new Error('Could not parse owner/repo from the URL. Use formats like: owner/repo, https://github.com/owner/repo, or https://api.github.com/repos/owner/repo/contributors');
      }

      const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {
        repository(owner: $owner, name: $name) {
          name
          nameWithOwner
          owner { login }
        }
        mergedPRs: search(type: ISSUE, query: $q) {
          issueCount
        }
        user(login: $login) { login }
      }`;

      const variables = {
        login: username.trim() || '',
        owner,
        name,
        q: `repo:${owner}/${name} is:pr is:merged author:${username.trim() || ''}`,
      };

      const response = await fetch('/api/prove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
          githubToken: githubToken.trim() || undefined,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPresentation(data);
      setResult({ type: 'prove', data });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prove URL');
    } finally {
      setIsProving(false);
    }
  };

  const handleVerify = async () => {
    if (!presentation) {
      setError('Please prove a URL first');
      return;
    }

    if (!username.trim()) {
      setError('Please enter your GitHub username');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(presentation)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Parse GraphQL verification response (login + merged PRs count)
      let contributionData = null;
      const body = data?.response?.body;
      let graph: any = null;
      if (typeof body === 'string') {
        try {
          graph = JSON.parse(body);
        } catch {
          setError('Failed to parse contribution data');
          return;
        }
      } else if (body && typeof body === 'object') {
        graph = body;
      }

      const userLogin = graph?.data?.user?.login;
      const mergedCount = graph?.data?.mergedPRs?.issueCount;

      if (typeof userLogin === 'string' && typeof mergedCount === 'number') {
        contributionData = {
          username: userLogin,
          total: mergedCount,
        };
      } else {
        setError(`No merged PR data found for username: ${username.trim()}`);
        return;
      }

      setResult({ 
        type: 'verify', 
        data: { ...data, contributionData }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify presentation');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCompress = async () => {
    if (!presentation) {
      setError('Please prove a URL first');
      return;
    }

    if (!username.trim()) {
      setError('Please enter your GitHub username');
      return;
    }

    setIsCompressing(true);
    setError(null);

    try {
      const response = await fetch('/api/compress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          presentation,
          username: username.trim()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Extract user data from publicOutputs if available
      let userData = null;
      let zkProof = null;
      let publicOutputs = null;

      // Handle both response structures: with or without success wrapper
      if (data.success && data.data) {
        zkProof = data.data.zkProof;
        publicOutputs = data.data.publicOutputs;
      } else {
        zkProof = data.zkProof;
        publicOutputs = data.publicOutputs;
      }

      if (publicOutputs && publicOutputs.extractedValues) {
        const values = publicOutputs.extractedValues;
        // Values are in order: login, contributions
        if (values.length >= 2 && values[0] && values[1]) {
          userData = {
            username: values[0],
            total: parseInt(values[1]) || values[1]
          };
        }
      }

      setZkProofResult({
        zkProof,
        publicOutputs,
        userData
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate ZK proof');
    } finally {
      setIsCompressing(false);
    }
  };

  const supportedChains = useMemo(() => ([
    { id: anvil.id, name: 'Anvil' },
    { id: sepolia.id, name: 'Sepolia' },
    { id: baseSepolia.id, name: 'Base Sepolia' },
    { id: optimismSepolia.id, name: 'OP Sepolia' },
  ]), []);

  const handleVerifyOnChain = async () => {
    try {
      setError(null);
      if (!zkProofResult?.zkProof || !zkProofResult?.publicOutputs) {
        setError('Generate ZK proof first');
        return;
      }
      if (!contractAddress || contractAddress.length < 10) {
        setError('Enter contract address');
        return;
      }
      if (!isConnected) {
        setError('Connect your wallet');
        return;
      }
      if (chainId !== selectedChainId && switchChain) {
        await switchChain({ chainId: selectedChainId });
      }

      const pub = zkProofResult.publicOutputs;
      const notaryFpHex = pub.notaryKeyFingerprint.startsWith('0x')
        ? pub.notaryKeyFingerprint
        : (`0x${pub.notaryKeyFingerprint}` as `0x${string}`);
      const queriesHashHex = pub.queriesHash as `0x${string}`;
      const ts = BigInt(pub.timestamp);
      const userFromValues = String(pub.values?.[0] ?? username);
      const contribFromValuesRaw = pub.values?.[1];
      const contributions = BigInt(
        typeof contribFromValuesRaw === 'number' ? contribFromValuesRaw : parseInt(String(contribFromValuesRaw), 10)
      );

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
          notaryFpHex as `0x${string}`,
          pub.url as string,
          ts,
          queriesHashHex,
          userFromValues,
          contributions,
        ]
      );

      // zkProof can be hex string or bytes-like coming from API
      let sealHex: `0x${string}`;
      if (typeof zkProofResult.zkProof === 'string') {
        sealHex = zkProofResult.zkProof.startsWith('0x') ? zkProofResult.zkProof : (`0x${zkProofResult.zkProof}` as `0x${string}`);
      } else if (zkProofResult.zkProof?.seal) {
        // some APIs return { seal: '0x..' }
        const s = zkProofResult.zkProof.seal;
        sealHex = s.startsWith('0x') ? s : (`0x${s}` as `0x${string}`);
      } else {
        // fallback convert via bytes->hex
        sealHex = toHex(toBytes(JSON.stringify(zkProofResult.zkProof))) as `0x${string}`;
      }

      const hash = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: GitHubContributionVerifierAbi,
        functionName: 'submitContribution',
        args: [journalData, sealHex],
        chainId: selectedChainId,
      });

      setResult({ type: 'onchain', data: { txHash: hash, username: userFromValues, contributions: Number(contributions) } });
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'On-chain verification failed');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light mb-4">vlayer GitHub Prover</h1>
          <p className="text-gray-400 text-lg">Prove contributions to GitHub repositories</p>
        </div>

        <div className="space-y-8">
          {/* GitHub URL Input */}
          <div className="space-y-4">
            <label htmlFor="url" className="block text-sm font-medium text-gray-300">
              GitHub Repository (owner/repo)
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="owner/repo (e.g., vlayer-xyz/vlayer)"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7235e5] focus:border-transparent text-white placeholder-gray-500"
              disabled={isProving || isVerifying || isCompressing}
            />
          </div>

          {/* Private Repo Toggle */}
          <div className="space-y-2">
            <label className="inline-flex items-center gap-3 text-sm font-medium text-gray-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-[#7235e5] focus:ring-[#7235e5]"
                checked={isPrivateRepo}
                onChange={(e) => setIsPrivateRepo(e.target.checked)}
                disabled={isProving || isVerifying || isCompressing}
              />
              <span>Is it private repo?</span>
            </label>
          </div>

          {/* GitHub Token Input (visible only for private repos) */}
          {isPrivateRepo && (
            <div className="space-y-4">
              <label htmlFor="token" className="block text-sm font-medium text-gray-300">
                GitHub Personal Access Token (for private repos)
              </label>
              <input
                id="token"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="github_pat_..."
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7235e5] focus:border-transparent text-white placeholder-gray-500"
                disabled={isProving || isVerifying || isCompressing}
              />
              <p className="text-xs text-gray-500">
                Required for private repositories. Generate one at{' '}
                <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="text-[#7235e5] hover:underline">
                  GitHub Settings → Developer settings → Personal access tokens
                </a>
              </p>
            </div>
          )}

          {/* Username Input */}
          <div className="space-y-4">
            <label htmlFor="username" className="block text-sm font-medium text-gray-300">
              Your GitHub Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7235e5] focus:border-transparent text-white placeholder-gray-500"
              disabled={isProving || isVerifying || isCompressing}
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            <button
              onClick={handleProve}
              disabled={isProving || isVerifying || isCompressing}
              className="w-full px-6 py-3 bg-[#7235e5] hover:bg-[#5d2bc7] disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isProving ? 'Proving...' : 'Prove Contributions'}
            </button>

            <div className="flex gap-4">
              <button
                onClick={handleCompress}
                disabled={!presentation || !username.trim() || isProving || isVerifying || isCompressing}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {isCompressing ? 'Generating ZK Proof...' : 'Generate ZK Proof'}
              </button>

              <button
                onClick={handleVerify}
                disabled={!presentation || !username.trim() || isProving || isVerifying || isCompressing}
                className="flex-1 px-6 py-3 bg-[#7235e5] hover:bg-[#5d2bc7] disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {isVerifying ? 'Verifying...' : 'Verify Proof'}
              </button>
            </div>
          </div>

          {/* On-chain Verification Controls */}
          {zkProofResult && (
            <div className="space-y-4 p-4 bg-gray-900 border border-gray-700 rounded-lg">
              <h3 className="text-sm font-medium text-gray-300">On-chain verification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Network</label>
                  <select
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                    value={selectedChainId}
                    onChange={(e) => setSelectedChainId(parseInt(e.target.value, 10))}
                  >
                    {supportedChains.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Contract address</label>
                  <input
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                    placeholder="0x..."
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                {!isConnected ? (
                  <button
                    onClick={() => connect({ connector: injected() })}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded"
                    disabled={isConnecting}
                  >
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                ) : (
                  <button
                    onClick={() => disconnect()}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded"
                  >
                    Disconnect {address?.slice(0, 6)}…{address?.slice(-4)}
                  </button>
                )}
                <button
                  onClick={handleVerifyOnChain}
                  disabled={!isConnected || !contractAddress || isWriting || isSwitching}
                  className="px-4 py-2 bg-[#7235e5] hover:bg-[#5d2bc7] disabled:bg-gray-700 rounded"
                >
                  {isWriting || isSwitching ? 'Submitting…' : 'Verify on-chain'}
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* ZK Proof Results Display */}
          {zkProofResult && (
            <div className="space-y-4">
              {zkProofResult.userData ? (
                <>
                  {/* Detailed ZK proof result with user data */}
                  <div className="p-6 bg-gray-900 border border-green-700 rounded-lg">
                    <h3 className="text-lg font-medium text-green-400 mb-4">ZK Proof Generated Successfully</h3>
                    <div className="flex items-center space-x-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center">
                        <span className="text-green-400 text-xl">✓</span>
                      </div>
                      <div>
                        <p className="text-white font-medium">@{zkProofResult.userData.username}</p>
                        <p className="text-gray-400 text-sm">Verified with Zero-Knowledge Proof</p>
                      </div>
                    </div>
                    <div className="bg-green-600/10 border border-green-600/20 rounded-lg p-4">
                      <p className="text-green-400 font-semibold text-xl">
                        {zkProofResult.userData.total} contributions proven with ZK
                      </p>
                      <p className="text-gray-400 text-sm mt-1">
                        Your contributions have been cryptographically proven using zero-knowledge proofs
                      </p>
                    </div>
                  </div>

                  {/* Public Outputs Details */}
                  {zkProofResult.publicOutputs && (
                    <details className="bg-gray-900 border border-gray-700 rounded-lg">
                      <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">
                        Public Outputs
                      </summary>
                      <div className="p-4 pt-0 space-y-3 text-sm">
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-gray-500">Verified URL:</span>
                          <span className="text-gray-300 break-all">{zkProofResult.publicOutputs.url}</span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-gray-500">Method:</span>
                          <span className="text-gray-300">{zkProofResult.publicOutputs.method}</span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-gray-500">Timestamp:</span>
                          <span className="text-gray-300">
                            {new Date(zkProofResult.publicOutputs.tlsTimestamp * 1000).toLocaleString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-gray-500">Extracted Values:</span>
                          <div className="text-gray-300">
                            {zkProofResult.publicOutputs.extractedValues?.map((value: any, idx: number) => (
                              <div key={idx} className="font-mono text-xs bg-gray-800 px-2 py-1 rounded mb-1">
                                [{idx}]: {JSON.stringify(value)}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-gray-500">Queries Hash:</span>
                          <span className="text-gray-300 font-mono text-xs break-all">{zkProofResult.publicOutputs.extractionHash}</span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-gray-500">Notary Fingerprint:</span>
                          <span className="text-gray-300 font-mono text-xs break-all">{zkProofResult.publicOutputs.notaryKeyFingerprint}</span>
                        </div>
                      </div>
                    </details>
                  )}

                  {/* ZK Proof Data */}
                  <details className="bg-gray-900 border border-gray-700 rounded-lg">
                    <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">
                      ZK Proof Data
                    </summary>
                    <div className="p-4 pt-0">
                      <pre className="text-xs text-gray-400 overflow-x-auto break-all bg-gray-800 p-3 rounded">
                        {JSON.stringify(zkProofResult.zkProof, null, 2)}
                      </pre>
                    </div>
                  </details>
                </>
              ) : (
                <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">ZK Proof Generated</h3>
                  <pre className="text-xs text-gray-400 overflow-x-auto">
                    {JSON.stringify(zkProofResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="space-y-4">
              {result.type === 'onchain' && (
                <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">On-chain submission sent</h3>
                  <div className="text-xs text-gray-400 break-all">
                    Tx hash: {result.data.txHash}
                  </div>
                </div>
              )}
              {result.type === 'verify' && result.data.contributionData ? (
                <>
                  {/* Detailed verification modal with profile picture */}
                  <div className="p-6 bg-gray-900 border border-gray-700 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-300 mb-4">✅ Verification Successful</h3>
                    <div className="mb-4">
                      <p className="text-white font-medium">@{result.data.contributionData.username}</p>
                      <p className="text-gray-400 text-sm">GitHub Contributor</p>
                    </div>
                    <div className="bg-[#7235e5]/10 border border-[#7235e5]/20 rounded-lg p-4">
                      <p className="text-[#7235e5] font-semibold text-xl">
                        {result.data.contributionData.total} contributions verified
                      </p>
                      <p className="text-gray-400 text-sm mt-1">
                        Your contributions to this repository have been cryptographically verified
                      </p>
                    </div>
                  </div>
                  
                  {/* Full verification response */}
                  <details className="bg-gray-900 border border-gray-700 rounded-lg">
                    <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">
                      Full Verification Response
                    </summary>
                    <div className="p-4 pt-0">
                      <pre className="text-xs text-gray-400 overflow-x-auto bg-gray-800 p-3 rounded">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>
                  </details>
                </>
              ) : (
                <details className="bg-gray-900 border border-gray-700 rounded-lg">
                  <summary className="p-4 text-sm font-medium text-gray-300 cursor-pointer hover:text-white">
                    {result.type === 'prove' ? 'GitHub Contribution Proof' : 'Verification Result'}
                  </summary>
                  <div className="p-4 pt-0">
                    <pre className="text-xs text-gray-400 overflow-x-auto bg-gray-800 p-3 rounded">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
        
        {/* Powered by vlayer Footer */}
        <div className="mt-16 pt-8 border-t border-gray-800">
          <div className="flex justify-center items-center space-x-2 text-gray-500">
            <span className="text-sm">Powered by</span>
            <img 
              src="/powered-by-vlayer.svg" 
              alt="Vlayer" 
              className="h-5"
            />
          </div>
        </div>
      </div>
    </div>
  );
}