"use client";

import React from "react";

export function GitHubTokenInput(props: {
  visible: boolean;
  githubToken: string;
  setGithubToken: (v: string) => void;
  disabled?: boolean;
}) {
  if (!props.visible) return null;
  return (
    <div className="space-y-4">
      <label htmlFor="token" className="block text-sm font-medium text-gray-300">
        GitHub Personal Access Token (for private repos)
      </label>
      <input
        id="token"
        type="password"
        value={props.githubToken}
        onChange={(e) => props.setGithubToken(e.target.value)}
        placeholder="github_pat_..."
        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7235e5] focus:border-transparent text-white placeholder-gray-500"
        disabled={props.disabled}
      />
      <p className="text-xs text-gray-500">
        Required for private repositories. Generate one at{' '}
        <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="text-[#7235e5] hover:underline">
          GitHub Settings → Developer settings → Personal access tokens
        </a>
      </p>
    </div>
  );
}


