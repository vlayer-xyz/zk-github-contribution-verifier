"use client";

import React from "react";

export function RepositoryInput(props: {
  url: string;
  setUrl: (v: string) => void;
  isPrivateRepo: boolean;
  setIsPrivateRepo: (v: boolean) => void;
  disabled?: boolean;
  setError: (m: string | null) => void;
}) {
  const { url, setUrl, isPrivateRepo, setIsPrivateRepo, disabled, setError } = props;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] md:items-center gap-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-300 mb-2">
            GitHub Repository (owner/repo)
          </label>
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => {
              const v = e.target.value;
              setUrl(v);
              if (v.trim().includes('/')) setError(null);
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && !v.includes('/')) setError('Repository must be in owner/repo format');
            }}
            placeholder="owner/repo (e.g., vlayer-xyz/vlayer)"
            pattern="[^/]+/[^/]+"
            title="Use owner/repo format, e.g., vlayer-xyz/vlayer"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7235e5] focus:border-transparent text-white placeholder-gray-500"
            disabled={disabled}
          />
        </div>
        <label className="inline-flex items-center gap-3 text-sm font-medium text-gray-300">
          <input
            type="checkbox"
            className="h-6 w-6 rounded border-gray-700 bg-gray-900 text-[#7235e5] focus:ring-[#7235e5]"
            checked={isPrivateRepo}
            onChange={(e) => setIsPrivateRepo(e.target.checked)}
            disabled={disabled}
          />
          <span>Is it private repo?</span>
        </label>
      </div>
    </div>
  );
}


