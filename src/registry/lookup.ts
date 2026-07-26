/**
 * Registry lookup.
 *
 * This is a deterministic table, NOT a classifier. It answers exactly one
 * question: has a human, with evidence, recorded that this specific capability
 * is expected for this specific token?
 *
 * The distinction matters. A runtime classifier that infers "this looks like a
 * stablecoin" is trivially gamed: name a token "USD Yield Vault", inherit a
 * blanket pardon for mint and freeze authority, then use the live mint.
 * Requiring a reviewed entry keyed on the exact contract address removes that
 * attack, because the address cannot be spoofed and the entry cannot be created
 * without evidence and a named approver.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Capability, Chain } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = join(HERE, '..', '..', 'registry');

export interface ExpectedCapability {
  capability: Capability;
  justification: string;
  constrainedBy?: string;
}

export interface RegistryEntry {
  id: string;
  chain: Chain;
  address: string;
  symbol: string;
  name: string;
  decimals?: number;
  issuer: { name: string; jurisdiction?: string; website?: string; regulated?: boolean };
  archetype: string;
  expectedCapabilities: ExpectedCapability[];
  evidence: Array<{ kind: string; detail: string; url?: string; observedAt?: string }>;
  caveats?: string[];
  commercialRelationship: string | null;
  verifiedAt: string;
  reviewDue?: string;
  approvedBy: string;
}

let cache: RegistryEntry[] | null = null;

export async function loadRegistry(): Promise<RegistryEntry[]> {
  if (cache) return cache;

  const out: RegistryEntry[] = [];
  for (const chain of ['ethereum', 'solana'] as const) {
    const dir = join(REGISTRY_DIR, 'issuers', chain);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      out.push(JSON.parse(await readFile(join(dir, file), 'utf8')) as RegistryEntry);
    }
  }

  cache = out;
  return out;
}

/** Addresses are compared case-insensitively on EVM and exactly on Solana. */
export function findEntry(entries: RegistryEntry[], chain: Chain, address: string): RegistryEntry | null {
  return (
    entries.find((e) => {
      if (e.chain !== chain) return false;
      return chain === 'ethereum'
        ? e.address.toLowerCase() === address.toLowerCase()
        : e.address === address;
    }) ?? null
  );
}

/**
 * Entries expire. A registry that silently vouches forever is a registry nobody
 * is maintaining, and the whole premise here is that a human stands behind each
 * entry. Past `reviewDue` the entry stops granting EXPECTED status and the token
 * falls back to being scored on structure alone.
 */
export function isStale(entry: RegistryEntry, now: Date = new Date()): boolean {
  if (!entry.reviewDue) return false;
  return new Date(entry.reviewDue).getTime() < now.getTime();
}

export function expectationFor(
  entry: RegistryEntry | null,
  capability: Capability,
  now: Date = new Date()
): ExpectedCapability | null {
  if (!entry || isStale(entry, now)) return null;
  return entry.expectedCapabilities.find((c) => c.capability === capability) ?? null;
}
