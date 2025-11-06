"use client";

import React from "react";

export function UsernameInput(props: {
  username: string;
  setUsername: (v: string) => void;
  disabled?: boolean;
  setError: (m: string | null) => void;
}) {
  const { username, setUsername, disabled, setError } = props;
  return (
    <div className="space-y-4">
      <label htmlFor="username" className="block text-sm font-medium text-gray-300">
        Your GitHub Username
      </label>
      <input
        id="username"
        type="text"
        value={username}
        onChange={(e) => {
          const v = e.target.value;
          setUsername(v);
          if (v.trim()) setError(null);
        }}
        onBlur={(e) => { if (!e.target.value.trim()) setError('Username is required'); }}
        placeholder="username"
        required
        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7235e5] focus:border-transparent text-white placeholder-gray-500"
        disabled={disabled}
      />
    </div>
  );
}


