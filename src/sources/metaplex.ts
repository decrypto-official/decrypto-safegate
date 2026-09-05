/**
 * Metaplex Token Metadata, read directly.
 *
 * A Solana token's name, symbol, URI and the authority that can rewrite them
 * live in a separate account owned by the Metaplex Token Metadata program. Its
 * address is a program-derived address (PDA) of the mint, so it can be located
 * without an index: hash the seeds with each bump from 255 down until the
 * result is not a valid ed25519 point.
 *
 * The curve check is why this file has dependencies. @noble/curves does the
 * ed25519 decode, @scure/base does base58. Both are small and audited.
 *
 * Verified 2026-09-06 against mainnet: the derivation below produces
 * 5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq for the USDC mint, which is the
 * account the Metaplex program owns for it.
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58 } from '@scure/base';

export const METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

const encoder = new TextEncoder();

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** The metadata PDA for a mint, and the bump that produced it. */
export function findMetadataPda(mint: string): { address: string; bump: number } {
  const program = base58.decode(METADATA_PROGRAM_ID);
  const mintBytes = base58.decode(mint);
  const marker = encoder.encode('ProgramDerivedAddress');
  const seed = encoder.encode('metadata');

  for (let bump = 255; bump >= 0; bump -= 1) {
    const candidate = sha256(concat(seed, program, mintBytes, new Uint8Array([bump]), program, marker));
    if (!isOnCurve(candidate)) {
      return { address: base58.encode(candidate), bump };
    }
  }
  throw new Error(`no program-derived address found for mint ${mint}`);
}

export interface MetaplexMetadata {
  key: number;
  updateAuthority: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  primarySaleHappened: boolean;
  isMutable: boolean;
}

/** Metaplex account discriminator for MetadataV1. */
const KEY_METADATA_V1 = 4;

/**
 * Parse a Metaplex metadata account. Borsh layout, read field by field:
 *
 *   u8 key | 32 updateAuthority | 32 mint | string name | string symbol |
 *   string uri | u16 sellerFeeBasisPoints | Option<Vec<Creator>> creators |
 *   u8 primarySaleHappened | u8 isMutable | ...
 *
 * Strings are u32 length + bytes, null-padded. Everything after isMutable is
 * ignored. Throws on anything malformed; the caller records UNKNOWN rather than
 * guessing.
 */
export function parseMetadata(data: Uint8Array): MetaplexMetadata {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const u8 = (): number => {
    if (offset + 1 > data.length) throw new Error('metadata account truncated');
    return data[offset++]!;
  };
  const u16 = (): number => {
    if (offset + 2 > data.length) throw new Error('metadata account truncated');
    const v = view.getUint16(offset, true);
    offset += 2;
    return v;
  };
  const u32 = (): number => {
    if (offset + 4 > data.length) throw new Error('metadata account truncated');
    const v = view.getUint32(offset, true);
    offset += 4;
    return v;
  };
  const pubkey = (): string => {
    if (offset + 32 > data.length) throw new Error('metadata account truncated');
    const v = base58.encode(data.subarray(offset, offset + 32));
    offset += 32;
    return v;
  };
  const string = (): string => {
    const length = u32();
    if (length > 4096 || offset + length > data.length) throw new Error('metadata string length out of range');
    const text = new TextDecoder().decode(data.subarray(offset, offset + length));
    offset += length;
    return text.replace(/\0+$/, '');
  };

  const key = u8();
  if (key !== KEY_METADATA_V1) throw new Error(`unexpected metadata account key ${key}`);

  const updateAuthority = pubkey();
  const mint = pubkey();
  const name = string();
  const symbol = string();
  const uri = string();
  const sellerFeeBasisPoints = u16();

  const hasCreators = u8();
  if (hasCreators === 1) {
    const count = u32();
    if (count > 64) throw new Error('creator count out of range');
    offset += count * (32 + 1 + 1);
    if (offset > data.length) throw new Error('metadata account truncated');
  } else if (hasCreators !== 0) {
    throw new Error('malformed creators option');
  }

  const primarySaleHappened = u8() === 1;
  const isMutable = u8() === 1;

  return { key, updateAuthority, mint, name, symbol, uri, sellerFeeBasisPoints, primarySaleHappened, isMutable };
}
