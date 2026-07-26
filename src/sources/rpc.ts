/**
 * Minimal JSON-RPC client with endpoint failover.
 *
 * Failover is not defensive padding. Public RPC endpoints go away or move behind
 * an API key without notice, so a single hardcoded endpoint is a guaranteed
 * future outage.
 */

export interface RpcConfig {
  endpoints: string[];
  timeoutMs?: number;
}

/** Order is preference order. */
export const DEFAULT_EVM_ENDPOINTS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.flashbots.net',
];

export const DEFAULT_SOLANA_ENDPOINTS = ['https://api.mainnet-beta.solana.com'];

export class RpcError extends Error {
  constructor(message: string, readonly endpoint?: string, readonly code?: number) {
    super(message);
    this.name = 'RpcError';
  }
}

export class RpcClient {
  private readonly endpoints: string[];
  private readonly timeoutMs: number;

  constructor(config: RpcConfig) {
    if (config.endpoints.length === 0) throw new Error('RpcClient needs at least one endpoint');
    this.endpoints = config.endpoints;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  /**
   * Try each endpoint in turn. Returns the first success.
   * Throws only when every endpoint fails, and reports why.
   */
  async call<T = unknown>(method: string, params: unknown[]): Promise<T> {
    const failures: string[] = [];

    for (const endpoint of this.endpoints) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          failures.push(`${endpoint}: HTTP ${response.status}`);
          continue;
        }

        const text = await response.text();
        let body: { result?: T; error?: { code?: number; message?: string } };
        try {
          body = JSON.parse(text);
        } catch {
          // Dead endpoints often return an HTML error page rather than JSON.
          failures.push(`${endpoint}: non-JSON response (${text.slice(0, 60)})`);
          continue;
        }

        if (body.error) {
          // A JSON-RPC error is a real answer from a working endpoint, so do not
          // fail over. `eth_call` reverting is meaningful information, not an outage.
          throw new RpcError(body.error.message ?? 'rpc error', endpoint, body.error.code);
        }

        return body.result as T;
      } catch (err) {
        if (err instanceof RpcError) throw err;
        failures.push(`${this.endpoints.indexOf(endpoint) >= 0 ? endpoint : '?'}: ${(err as Error).message}`);
      }
    }

    throw new RpcError(`all endpoints failed: ${failures.join('; ')}`);
  }
}

/** eth_call that treats a revert as a value, because a revert IS information. */
export async function ethCall(
  client: RpcClient,
  to: string,
  data: string
): Promise<{ ok: true; data: string } | { ok: false; reverted: true; message: string }> {
  try {
    const result = await client.call<string>('eth_call', [{ to, data }, 'latest']);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof RpcError && err.code !== undefined) {
      return { ok: false, reverted: true, message: err.message };
    }
    throw err;
  }
}

export async function ethGetStorageAt(client: RpcClient, address: string, slot: string): Promise<string> {
  return client.call<string>('eth_getStorageAt', [address, slot, 'latest']);
}

export async function ethGetCode(client: RpcClient, address: string): Promise<string> {
  return client.call<string>('eth_getCode', [address, 'latest']);
}

/** A 32-byte word holds an address in its low 20 bytes. Zero means unset. */
export function wordToAddress(word: string | null | undefined): string | null {
  if (!word || word === '0x') return null;
  const clean = word.replace(/^0x/, '').padStart(64, '0');
  const addr = '0x' + clean.slice(24);
  return /^0x0{40}$/.test(addr) ? null : addr;
}

/** Addresses that mean "deliberately discarded" rather than "someone controls this". */
const BURN_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
]);

export function isBurnAddress(addr: string | null): boolean {
  return addr === null || BURN_ADDRESSES.has(addr.toLowerCase());
}
