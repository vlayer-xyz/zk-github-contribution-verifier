export async function proveContributions(params: {
  query: string;
  variables: Record<string, unknown>;
  githubToken?: string;
}) {
  const res = await fetch('/api/prove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: params.query,
      variables: params.variables,
      githubToken: params.githubToken,
    }),
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function verifyPresentation(presentation: any) {
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(presentation),
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function compressPresentation(presentation: any, username: string) {
  const res = await fetch('/api/compress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presentation, username }),
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}


