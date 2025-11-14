import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';

export type ManagedProcess = ChildProcessWithoutNullStreams & { label: string };

export function startProcess(command: string, args: string[], label: string, options: SpawnOptionsWithoutStdio = {}) {
  const child = spawn(command, args, {
    ...options,
    stdio: 'pipe',
  }) as ManagedProcess;
  child.label = label;

  const log = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
    process.stdout.write(`[${label}:${stream}] ${data}`);
  };
  child.stdout.on('data', log('stdout'));
  child.stderr.on('data', log('stderr'));
  return child;
}

export async function waitForOutput(proc: ManagedProcess, regex: RegExp, timeoutMs = 30_000) {
  return await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${regex} from ${proc.label}`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      if (regex.test(chunk.toString())) {
        cleanup();
        resolve();
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`${proc.label} exited early (code=${code}, signal=${signal})`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      proc.stdout.off('data', onData);
      proc.stderr.off('data', onData);
      proc.off('exit', onExit);
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.once('exit', onExit);
  });
}

export async function stopProcess(proc?: ManagedProcess | null) {
  if (!proc) return;
  if (proc.killed) return;

  return await new Promise<void>((resolve) => {
    const killTimer = setTimeout(() => proc.kill('SIGKILL'), 5_000);
    proc.once('exit', () => {
      clearTimeout(killTimer);
      resolve();
    });
    proc.kill('SIGTERM');
  });
}

export async function runCommand(command: string, args: string[], options: SpawnOptionsWithoutStdio = {}) {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: 'pipe',
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${command} ${args.join(' ')}): ${output}`));
    });
  });
}
