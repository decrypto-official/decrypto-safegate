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
import { join } from 'node:path';
import type { Capability, Chain } from '../types.js';
import { findDataDir, DataRootError } from '../data-root.js';

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

/**
 * Thrown when the registry cannot be read at all.
 *
 * An empty registry does not fail safe. It silently strips every EXPECTED status,
 * so a regulated stablecoin's mint and freeze authority stop being justified and
 * start being unexplained findings. A deployment fault must not be able to
 * change what a score means.
 */
export class RegistryLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryLoadError';
  }
}

/** `baseDir` is for tests. Passing it bypasses the cache. */
export async function loadRegistry(baseDir?: string): Promise<RegistryEntry[]> {
  if (!baseDir && cache) return cache;

  let root: string;
  if (baseDir) {
    root = baseDir;
  } else {
    try {
      root = await findDataDir('registry');
    } catch (err) {
      if (err instanceof DataRootError) throw new RegistryLoadError(err.message);
      throw err;
    }
  }

  const out: RegistryEntry[] = [];
  for (const chain of ['ethereum', 'solana'] as const) {
    const dir = join(root, 'issuers', chain);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new RegistryLoadError(
          `registry directory not found: ${dir}. In a bundled deployment this usually ` +
            `means registry/**/*.json was not included in the build output.`
        );
      }
      throw err;
    }
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      out.push(JSON.parse(await readFile(join(dir, file), 'utf8')) as RegistryEntry);
    }
  }

  if (out.length === 0) {
    throw new RegistryLoadError(
      `registry directory ${root} contains no usable entries. Every token would be ` +
        `scored as if no capability were ever justified.`
    );
  }

  if (!baseDir) cache = out;
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
