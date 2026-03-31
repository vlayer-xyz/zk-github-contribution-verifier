import { afterEach, describe, expect, test } from 'vitest';
import { type ManagedProcess, startProcess, stopProcess, waitForOutput } from '../helpers/process';
import { getAvailablePort } from '../helpers/network';
import { projectRoot } from '../helpers/env';

async function collectAndWaitForExit(
  proc: ManagedProcess,
  timeoutMs = 15_000
): Promise<{ output: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let output = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(
        new Error(
          `Process ${proc.label} did not exit within ${timeoutMs}ms. Output so far:\n${output}`
        )
      );
    }, timeoutMs);

    proc.once('exit', (code) => {
      clearTimeout(timeout);
      resolve({ output, code });
    });
  });
}

function spawnNextDev(port: number, env: NodeJS.ProcessEnv): ManagedProcess {
  return startProcess(
    'npx',
    ['--no-install', 'next', 'dev', '-H', '127.0.0.1', '-p', String(port)],
    'next',
    { cwd: projectRoot, env }
  );
}

describe('server startup env validation', () => {
  let server: ManagedProcess | null = null;

  afterEach(async () => {
    await stopProcess(server ?? undefined);
    server = null;
  });

  test('fails at startup when required env vars are missing', async () => {
    const port = await getAvailablePort();

    server = spawnNextDev(port, {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME,
      NODE_ENV: 'development',
      PORT: String(port),
    });

    const { output, code } = await collectAndWaitForExit(server, 15_000);
    server = null; // already exited, skip afterEach cleanup

    expect(output).toContain('Missing required environment variable');
    expect(code).not.toBe(0);
  });

  test('starts successfully when all required env vars are provided', async () => {
    const port = await getAvailablePort();

    // process.env already has vars loaded from .env.test by tests/helpers/env.ts
    server = spawnNextDev(port, {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
    });

    await waitForOutput(server, /Ready in/i, 30_000);
  });
});
