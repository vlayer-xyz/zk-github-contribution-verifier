import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export async function getAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

export async function waitForServer(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok || response.status >= 300) {
        return;
      }
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error(`Server ${url} did not become ready in time`);
}
