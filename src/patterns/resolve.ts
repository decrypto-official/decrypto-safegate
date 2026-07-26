/**
 * Loads patterns/ and applies them against a live chain.
 *
 * This module executes the dictionary. It contains no knowledge about specific
 * tokens and makes no judgement about whether a finding is good or bad. Adding
 * support for a new contract shape means adding a JSON file, not editing this.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Capability, ChainFamily, Observation } from '../types.js';
import { RpcClient, ethCall, ethGetStorageAt, wordToAddress, isBurnAddress } from '../sources/rpc.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PATTERNS_DIR = join(HERE, '..', '..', 'patterns');

export interface PatternMethod {
  kind: 'storage-slot' | 'call-selector' | 'account-field';
  storageSlot?: string;
  slotDerivation?: string;
  callSelector?: string;
  signature?: string;
  accountField?: string;
  returnType: string;
}

export interface Pattern {
  id: string;
  title?: string;
  chainFamily: ChainFamily;
  capability: Capability;
  method: PatternMethod;
  detects: string;
  nonEmptyMeans?: 'capability-present' | 'capability-absent';
  presenceIndicatedBy?: 'non-empty-value' | 'call-success';
  knownFalseNegative?: string;
  coversExamples?: Array<{ chain: string; address: string; symbol: string; observed?: string }>;
  rationale: string;
  references?: string[];
  addedAt: string;
  addedBy?: string;
}

let cache: Pattern[] | null = null;

/**
 * Thrown when the dictionary cannot be read at all.
 *
 * This has to be loud. A missing directory is a packaging or deployment fault,
 * and an empty dictionary produces a score with no signals in it, which reads as
 * a clean bill of health rather than as an error. "Absence is never safety"
 * applies to our own data before it applies to anyone's token.
 */
export class PatternLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatternLoadError';
  }
}

/** `baseDir` is for tests. Passing it bypasses the cache. */
export async function loadPatterns(baseDir?: string): Promise<Pattern[]> {
  if (!baseDir && cache) return cache;
  const root = baseDir ?? PATTERNS_DIR;

  const out: Pattern[] = [];
  for (const family of ['evm', 'solana'] as const) {
    const dir = join(root, family);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new PatternLoadError(
          `pattern directory not found: ${dir}. The dictionary is required, not optional. ` +
            `In a bundled deployment this usually means patterns/**/*.json was not included in the build output.`
        );
      }
      throw err;
    }
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const pattern = JSON.parse(await readFile(join(dir, file), 'utf8')) as Pattern;
      // The filename is part of the contract. A mismatch means a rename went wrong
      // and would silently break the regression fixtures that reference the id.
      const expected = file.replace(/\.json$/, '');
      if (pattern.id !== expected) {
        throw new Error(`pattern id "${pattern.id}" does not match filename "${expected}" in ${family}/${file}`);
      }
      out.push(pattern);
    }
  }

  // A readable but empty dictionary is the same outage with a different cause.
  if (out.length === 0) {
    throw new PatternLoadError(
      `pattern directory ${root} contains no usable patterns. Scoring with an empty ` +
        `dictionary produces no signals at all, which would render as a perfect score.`
    );
  }

  if (!baseDir) cache = out;
  return out;
}

export function patternsFor(patterns: Pattern[], family: ChainFamily, capability?: Capability): Pattern[] {
  return patterns.filter(
    (p) => p.chainFamily === family && (capability === undefined || p.capability === capability)
  );
}

/**
 * Apply every EVM pattern to one address.
 *
 * Returns one Observation per pattern, including the ones that found nothing.
 * A pattern that found nothing still matters: it is the difference between
 * "we checked and it is not there" and "we never checked".
 */
export async function applyEvmPatterns(
  client: RpcClient,
  address: string,
  patterns: Pattern[]
): Promise<Observation[]> {
  const observations: Observation[] = [];
  const now = new Date().toISOString();

  for (const pattern of patternsFor(patterns, 'evm')) {
    const { method } = pattern;

    try {
      if (method.kind === 'storage-slot' && method.storageSlot) {
        const word = await ethGetStorageAt(client, address, method.storageSlot);
        const addr = wordToAddress(word);
        observations.push({
          capability: pattern.capability,
          value: addr,
          source: 'onchain',
          patternId: pattern.id,
          method: `eth_getStorageAt ${method.storageSlot.slice(0, 12)}...`,
          observedAt: now,
        });
        continue;
      }

      if (method.kind === 'call-selector' && method.callSelector) {
        const result = await ethCall(client, address, method.callSelector);

        if (!result.ok) {
          // A revert means the function does not exist on this contract. That is a
          // definite finding about THIS pattern, and explicitly not a finding about
          // the capability overall, because another pattern may still locate it.
          observations.push({
            capability: pattern.capability,
            value: null,
            source: 'onchain',
            patternId: pattern.id,
            method: `${method.signature ?? method.callSelector} reverted, function not present`,
            observedAt: now,
          });
          continue;
        }

        // Two different meanings of "present", declared per pattern.
        //
        // call-success: the FUNCTION EXISTING proves the capability exists.
        // paused() returning false still means a pause mechanism is built into
        // the contract and someone holds the pauser role. Capability is what we
        // score, not whether it happens to be engaged at this instant.
        //
        // non-empty-value: the RETURNED VALUE decides. owner() returning the
        // zero address means ownership really was renounced.
        let value: string | boolean | null;
        let note = method.signature ?? method.callSelector ?? 'call';

        if (pattern.presenceIndicatedBy === 'call-success') {
          value = `mechanism present, currently ${summarise(result.data)}`;
          note = `${note} exists, so the capability is built in`;
        } else if (method.returnType === 'address') {
          const addr = wordToAddress(result.data);
          value = isBurnAddress(addr) ? null : addr;
        } else if (method.returnType === 'bool') {
          value = /[1-9a-f]/i.test(result.data.replace(/^0x/, ''));
        } else {
          value = result.data === '0x' ? null : result.data;
        }

        observations.push({
          capability: pattern.capability,
          value,
          source: 'onchain',
          patternId: pattern.id,
          method: note,
          observedAt: now,
        });
      }
    } catch (err) {
      // Transport failure. `undefined` means we could not look, which is distinct
      // from `null` meaning we looked and found nothing. Downstream this becomes
      // UNKNOWN and reduces coverage rather than passing as clean.
      observations.push({
        capability: pattern.capability,
        value: undefined,
        source: 'onchain',
        patternId: pattern.id,
        method: `failed: ${(err as Error).message}`,
        observedAt: now,
      });
    }
  }

  return observations;
}

/** Read the fields Solana patterns point at, from a parsed mint account. */
export async function applySolanaPatterns(
  mintAccount: Record<string, unknown> | null,
  tokenMeta: Record<string, unknown> | null,
  patterns: Pattern[]
): Promise<Observation[]> {
  const observations: Observation[] = [];
  const now = new Date().toISOString();

  for (const pattern of patternsFor(patterns, 'solana')) {
    const path = pattern.method.accountField;
    if (!path) continue;

    const root = path.startsWith('tokenMeta.') ? tokenMeta : mintAccount;
    const relative = path.replace(/^tokenMeta\./, '');

    if (root === null) {
      observations.push({
        capability: pattern.capability,
        value: undefined,
        source: 'onchain',
        patternId: pattern.id,
        method: `${path} unavailable, account not fetched`,
        observedAt: now,
      });
      continue;
    }

    const value = readPath(root, relative);
    observations.push({
      capability: pattern.capability,
      value: (value ?? null) as Observation['value'],
      source: 'onchain',
      patternId: pattern.id,
      method: path,
      observedAt: now,
    });
  }

  return observations;
}

function readPath(root: Record<string, unknown>, path: string): unknown {
  let current: unknown = root;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Compact description of a raw return word, for the observation note. */
function summarise(data: string): string {
  const clean = data.replace(/^0x/, '');
  if (clean.length === 0) return 'nothing';
  if (/^0+$/.test(clean)) return 'false/zero';
  return `0x${clean.slice(0, 8)}...`;
}
