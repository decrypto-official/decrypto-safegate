/**
 * Solana source. Reads the mint account and its Metaplex metadata directly
 * from a public RPC. No API key.
 *
 * Known limit: getTokenLargestAccounts is rate limited on the public endpoint
 * to the point of being unusable, so holder concentration is never read here.
 * See METHODOLOGY.md.
 */

import { RpcClient, DEFAULT_SOLANA_ENDPOINTS } from './rpc.js';
import { findMetadataPda, parseMetadata, METADATA_PROGRAM_ID } from './metaplex.js';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export interface SolanaMint {
  address: string;
  /** False when no account exists at the address. */
  exists: boolean;
  programId: string;
  /** The parsed account type the node reported, e.g. `mint`, `account`. Null if unparsed. */
  accountType: string | null;
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
    data: { parsed?: { info?: Record<string, unknown>; type?: string } } | [string, string];
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
      exists: false,
      programId: '',
      accountType: null,
      isToken2022: false,
      decimals: null,
      supply: null,
      mintAuthority: null,
      freezeAuthority: null,
      raw: null,
    };
  }

  const parsed = Array.isArray(value.data) ? undefined : value.data?.parsed;
  const info = parsed?.info ?? {};

  return {
    address: mint,
    exists: true,
    programId: value.owner,
    accountType: typeof parsed?.type === 'string' ? parsed.type : null,
    isToken2022: value.owner === TOKEN_2022_PROGRAM,
    decimals: typeof info.decimals === 'number' ? info.decimals : null,
    supply: typeof info.supply === 'string' ? info.supply : null,
    mintAuthority: (info.mintAuthority as string | null) ?? null,
    freezeAuthority: (info.freezeAuthority as string | null) ?? null,
    raw: { data: { parsed: { info } } },
  };
}

/**
 * What the dictionary reads for metadata-mutability on Solana.
 *
 * `effectiveUpdateAuthority` is the field patterns point at. It is the update
 * authority only while the account is mutable; an immutable account has an
 * authority recorded and nothing it can do with it. Null when no metadata
 * account exists, which is a verified absence: there is nothing to rewrite.
 */
export interface TokenMetaRecord {
  source: 'metaplex' | 'none';
  metadataAccount: string;
  updateAuthority: string | null;
  isMutable: boolean | null;
  effectiveUpdateAuthority: string | null;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  note: string;
}

interface Base64AccountResponse {
  value: { owner: string; data: [string, string] } | null;
}

/**
 * Read the Metaplex metadata account for a mint.
 *
 * Throws on transport failure or a malformed account, so the caller records
 * UNKNOWN. Returns `source: 'none'` when the account does not exist, which is
 * a real answer.
 */
export async function fetchTokenMetadata(client: RpcClient, mint: string): Promise<TokenMetaRecord> {
  const { address } = findMetadataPda(mint);
  const response = await client.call<Base64AccountResponse>('getAccountInfo', [
    address,
    { encoding: 'base64' },
  ]);

  const value = response?.value;
  if (!value) {
    return {
      source: 'none',
      metadataAccount: address,
      updateAuthority: null,
      isMutable: null,
      effectiveUpdateAuthority: null,
      name: null,
      symbol: null,
      uri: null,
      note: `no Metaplex metadata account exists at ${address}, so there is no name, symbol or URI to rewrite`,
    };
  }

  if (value.owner !== METADATA_PROGRAM_ID) {
    throw new Error(`metadata account ${address} is owned by ${value.owner}, not the Metaplex program`);
  }

  const bytes = Uint8Array.from(Buffer.from(value.data[0], 'base64'));
  const meta = parseMetadata(bytes);

  return {
    source: 'metaplex',
    metadataAccount: address,
    updateAuthority: meta.updateAuthority,
    isMutable: meta.isMutable,
    effectiveUpdateAuthority: meta.isMutable ? meta.updateAuthority : null,
    name: meta.name || null,
    symbol: meta.symbol || null,
    uri: meta.uri || null,
    note: meta.isMutable
      ? `Metaplex metadata at ${address} is mutable; update authority ${meta.updateAuthority}`
      : `Metaplex metadata at ${address} is immutable; the recorded update authority ${meta.updateAuthority} cannot change it`,
  };
}
