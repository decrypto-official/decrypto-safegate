/**
 * Minimal JSON-RPC client with endpoint failover.
 *
 * Public endpoints go away or move behind keys without notice, so a single
 * hardcoded endpoint is a guaranteed future outage.
 *
 * Two kinds of error come back from a JSON-RPC call and they mean opposite
 * things. An execution revert is an answer: the contract has no such function.
 * Anything else (rate limit, timeout, method not found, internal error) is the
 * endpoint failing to answer. Before 0.2.0 both were treated as reverts, so a
 * throttled endpoint turned every probe into "checked, not there".
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

/** `revert`: the contract answered by reverting. `rpc`: no endpoint could answer. */
export type RpcErrorKind = 'revert' | 'rpc';

export class RpcError extends Error {
  constructor(
    message: string,
    readonly kind: RpcErrorKind,
    readonly endpoint?: string,
    readonly code?: number
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

/**
 * Whether a JSON-RPC error object is an EVM execution revert.
 *
 * Geth-family nodes use code 3 with "execution reverted". Some others use
 * -32000 with a message containing "revert". Everything else is transport.
 */
export function isRevertError(code?: number, message?: string): boolean {
  if (code === 3) return true;
  return typeof message === 'string' && /revert/i.test(message);
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
   * A revert is returned immediately as an RpcError of kind 'revert'.
   * Any other failure moves to the next endpoint; if all fail, kind 'rpc'.
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
          failures.push(`${endpoint}: non-JSON response (${text.slice(0, 60)})`);
          continue;
        }

        if (body.error) {
          if (isRevertError(body.error.code, body.error.message)) {
            throw new RpcError(body.error.message ?? 'execution reverted', 'revert', endpoint, body.error.code);
          }
          failures.push(`${endpoint}: rpc error ${body.error.code ?? '?'} ${body.error.message ?? ''}`.trim());
          continue;
        }

        return body.result as T;
      } catch (err) {
        if (err instanceof RpcError) throw err;
        failures.push(`${endpoint}: ${(err as Error).message}`);
      }
    }

    throw new RpcError(`all endpoints failed: ${failures.join('; ')}`, 'rpc');
  }
}

/**
 * eth_call that treats a revert as a value, because a revert IS information.
 * `data` is the full calldata: selector plus any ABI-encoded arguments.
 * Transport failures propagate so the caller records "could not look".
 */
export async function ethCall(
  client: RpcClient,
  to: string,
  data: string
): Promise<{ ok: true; data: string } | { ok: false; reverted: true; message: string }> {
  try {
    const result = await client.call<string>('eth_call', [{ to, data }, 'latest']);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof RpcError && err.kind === 'revert') {
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

/**
 * What kind of thing sits at an EVM address, from its code.
 *
 * `none`: no code, an externally owned account or nothing at all.
 * `eip7702-delegation`: the 23-byte designator (0xef0100 + address) that an
 * EOA carries after delegating under EIP-7702. Not a token contract.
 * `contract`: anything else.
 */
export type CodeKind = 'none' | 'eip7702-delegation' | 'contract';

export function classifyCode(code: string | null | undefined): CodeKind {
  const clean = (code ?? '').replace(/^0x/, '').toLowerCase();
  if (clean.length === 0) return 'none';
  if (/^ef0100[0-9a-f]{40}$/.test(clean)) return 'eip7702-delegation';
  return 'contract';
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
