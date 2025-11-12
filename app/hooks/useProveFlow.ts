"use client";

import { useState } from "react";
import {
  proveContributions,
  verifyPresentation,
  compressPresentation,
} from "../lib/api";
import { extractContributionData, parseOwnerRepo } from "../lib/utils";
import type { PageResult, ZKProofNormalized } from "../lib/types";

export function useProveFlow() {
  const [url, setUrl] = useState("vlayer-xyz/vlayer");
  const [githubToken, setGithubToken] = useState("");
  const [username, setUsername] = useState("");
  const [isPrivateRepo, setIsPrivateRepo] = useState(false);

  const [isProving, setIsProving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [presentation, setPresentation] = useState<any>(null);
  const [result, setResult] = useState<PageResult | null>(null);
  const [zkProofResult, setZkProofResult] = useState<ZKProofNormalized | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function handleProve() {
    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    setIsProving(true);
    setError(null);
    setResult(null);
    setZkProofResult(null);

    try {
      const { owner, name } = parseOwnerRepo(url);
      if (!owner || !name) {
        throw new Error(
          "Could not parse owner/repo from the URL. Use formats like: owner/repo, https://github.com/owner/repo, or https://api.github.com/repos/owner/repo/contributors"
        );
      }

      const query = `query($login: String!, $owner: String!, $name: String!, $q: String!) {\n        repository(owner: $owner, name: $name) { name nameWithOwner owner { login } }\n        mergedPRs: search(type: ISSUE, query: $q) { issueCount }\n        user(login: $login) { login }\n      }`;

      const variables = {
        login: username.trim() || "",
        owner,
        name,
        q: `repo:${owner}/${name} is:pr is:merged author:${
          username.trim() || ""
        }`,
      };

      const data = await proveContributions({
        query,
        variables,
        githubToken: githubToken.trim() || undefined,
      });
      setPresentation(data);
      setResult({ type: "prove", data });
    } catch (err: any) {
      setError(err?.message || "Failed to prove URL");
    } finally {
      setIsProving(false);
    }
  }

  async function handleVerify() {
    if (!presentation) {
      setError("Please prove a URL first");
      return;
    }
    if (!username.trim()) {
      setError("Please enter your GitHub username");
      return;
    }
    setIsVerifying(true);
    setError(null);
    try {
      const data = await verifyPresentation(presentation);
      const contributionData = extractContributionData(data);
      if (!contributionData) {
        setError(`No merged PR data found for username: ${username.trim()}`);
        return;
      }
      setResult({ type: "verify", data: { ...data, contributionData } });
    } catch (err: any) {
      setError(err?.message || "Failed to verify presentation");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleCompress() {
    if (!presentation) {
      setError("Please prove a URL first");
      return;
    }
    if (!username.trim()) {
      setError("Please enter your GitHub username");
      return;
    }
    setIsCompressing(true);
    setError(null);
    try {
      const response = await compressPresentation(
        presentation,
        username.trim()
      );
      if (!response) throw new Error("Invalid ZK proof response");

      // Unwrap the { success, data } response from the server
      const data = response.data || response;
      if (!data.zkProof || !data.publicOutputs) {
        throw new Error("Invalid ZK proof response structure");
      }

      // best-effort user data extraction from publicOutputs
      let userData: { username: string; total: number } | null = null;
      const values = data.publicOutputs?.extractedValues ?? [];
      if (
        Array.isArray(values) &&
        values.length >= 2 &&
        values[0] &&
        values[1]
      ) {
        userData = {
          username: String(values[1]),
          total: parseInt(String(values[2] ?? values[1])) || 0,
        };
      }
      setZkProofResult({ ...data, userData });
    } catch (err: any) {
      setError(err?.message || "Failed to generate ZK proof");
    } finally {
      setIsCompressing(false);
    }
  }

  return {
    // state
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
    // actions
    handleProve,
    handleVerify,
    handleCompress,
  } as const;
}
