'use client';

import { useProveFlow } from './hooks/useProveFlow';
import { RepositoryInput } from './components/RepositoryInput';
import { GitHubTokenInput } from './components/GitHubTokenInput';
import { UsernameInput } from './components/UsernameInput';
import { ActionButtons } from './components/ActionButtons';
import { OnChainVerificationPanel } from './components/OnChainVerificationPanel';
import { ErrorDisplay } from './components/ErrorDisplay';
import { ZKProofResults } from './components/ZKProofResults';
import { VerificationResults } from './components/VerificationResults';

export default function Home() {
  const {
    url,
    setUrl,
    githubToken,
    setGithubToken,
    username,
    setUsername,
    isPrivateRepo,
    setIsPrivateRepo,
    isProving,
    isVerifying,
    isCompressing,
    presentation,
    result,
    zkProofResult,
    error,
    setError,
    handleProve,
    handleVerify,
    handleCompress,
  } = useProveFlow();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light mb-4">vlayer GitHub Prover</h1>
          <p className="text-gray-400 text-lg">Prove contributions to GitHub repositories</p>
        </div>

        <div className="space-y-8">
          <RepositoryInput
            url={url}
            setUrl={setUrl}
            isPrivateRepo={isPrivateRepo}
            setIsPrivateRepo={setIsPrivateRepo}
            disabled={isProving || isVerifying || isCompressing}
            setError={setError}
          />

          {/* GitHub Token Input (visible only for private repos) */}
          <GitHubTokenInput
            visible={isPrivateRepo}
            githubToken={githubToken}
            setGithubToken={setGithubToken}
            disabled={isProving || isVerifying || isCompressing}
          />

          {/* Username Input */}
          <UsernameInput
            username={username}
            setUsername={setUsername}
            disabled={isProving || isVerifying || isCompressing}
            setError={setError}
          />

          {/* Action Buttons */}
          <ActionButtons
            onProve={handleProve}
            onVerify={handleVerify}
            onCompress={handleCompress}
            canAct={!error && !!username.trim()}
            hasPresentation={!!presentation}
            isProving={isProving}
            isVerifying={isVerifying}
            isCompressing={isCompressing}
          />

          {/* On-chain Verification Controls */}
          {zkProofResult && (
            <OnChainVerificationPanel
              zkProofResult={zkProofResult}
              username={username}
              inputUrl={url}
              setError={setError}
            />
          )}

          {/* Error Display */}
          <ErrorDisplay error={error} />

          {/* ZK Proof Results Display */}
          {zkProofResult && <ZKProofResults zkProofResult={zkProofResult} />}

          {/* Results Display */}
          {result && <VerificationResults result={result} />}
        </div>

        {/* Powered by vlayer Footer */}
        <div className="mt-16 pt-8 border-t border-gray-800">
          <div className="flex justify-center items-center space-x-2 text-gray-500">
            <span className="text-sm">Powered by</span>
            <a href="https://docs.vlayer.xyz" target="_blank" rel="noopener noreferrer">
              <img src="/powered-by-vlayer.svg" alt="vlayer" className="h-5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
