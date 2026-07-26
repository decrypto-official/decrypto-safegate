/**
 * Solana source. Reads the mint account directly from a public RPC.
 *
 * Verified working with no API key on 2026-07-22.
 *
 * Known limit: getTokenLargestAccounts is permanently rate limited on the public
 * endpoint. It failed on every attempt during testing, including with four second
 * spacing, because it is an expensive scan. Holder concentration therefore comes
 * back UNKNOWN from our own reading. RugCheck's figure is displayed beside it as
 * an UnverifiedReference rather than merged in. See METHODOLOGY.md.
 */

import { RpcClient, DEFAULT_SOLANA_ENDPOINTS } from './rpc.js';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export interface SolanaMint {
  address: string;
  programId: string;
  isToken2022: boolean;
  decimals: number | null;
  supply: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** The full parsed info block, so pattern resolution can read arbitrary fields. */
  raw: Record<string, unknown> | null;
}

interface AccountInfoResponse {
  value: {
    owner: string;
    data: { parsed?: { info?: Record<string, unknown>; type?: string } };
  } | null;
}

export function solanaClient(endpoints: string[] = DEFAULT_SOLANA_ENDPOINTS): RpcClient {
  return new RpcClient({ endpoints });
}

export async function fetchMint(client: RpcClient, mint: string): Promise<SolanaMint> {
  const response = await client.call<AccountInfoResponse>('getAccountInfo', [
    mint,
    { encoding: 'jsonParsed' },
  ]);

  const value = response?.value;
  if (!value) {
    return {
      address: mint,
      programId: '',
      isToken2022: false,
      decimals: null,
      supply: null,
      mintAuthority: null,
      freezeAuthority: null,
      raw: null,
    };
  }

  const info = value.data?.parsed?.info ?? {};

  return {
    address: mint,
    programId: value.owner,
    isToken2022: value.owner === TOKEN_2022_PROGRAM,
    decimals: typeof info.decimals === 'number' ? info.decimals : null,
    supply: typeof info.supply === 'string' ? info.supply : null,
    mintAuthority: (info.mintAuthority as string | null) ?? null,
    freezeAuthority: (info.freezeAuthority as string | null) ?? null,
    raw: { data: { parsed: { info } } },
  };
}
