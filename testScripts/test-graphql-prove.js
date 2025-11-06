#!/usr/bin/env node

// Simple tester for GitHub GraphQL endpoint (direct call).
// Usage:
//   GITHUB_TOKEN=ghp_xxx OWNER=vlayer-xyz NAME=vlayer LOGIN=octocat node testScripts/test-graphql-prove.js
// Optional:
//   GITHUB_URL defaults to https://api.github.com/graphql

async function dotenvLoad() {
  try {
    const dotenv = await import('dotenv');
    if (dotenv && typeof dotenv.config === 'function') {
      dotenv.config();
    }
  } catch (_) {
    // dotenv not installed; continue without loading .env
  }
}

async function main() {
  await dotenvLoad();
  const githubUrl = process.env.GITHUB_URL || 'https://api.github.com/graphql';
  const token = process.env.GITHUB_TOKEN || '';
  const owner = process.env.OWNER || 'vlayer-xyz';
  const name = process.env.NAME || 'vlayer';
  const login = process.env.LOGIN || 'Chmarusso';

  if (!token) {
    console.error('Error: GITHUB_TOKEN env var is required');
    process.exit(1);
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

  const payload = {
    query,
    variables: {
      login,
      owner,
      name,
      q: `repo:${owner}/${name} is:pr is:merged author:${login}`,
    },
  };

  console.log(`POST ${githubUrl} (GraphQL)`);
  try {
    const res = await fetch(githubUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'zk-github-contribution-verifier',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
    } catch {
      console.log(text);
    }

    if (!res.ok) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Request failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();


