/**
 * Loads patterns/ and applies them against a live chain.
 *
 * This module executes the dictionary. It contains no knowledge about specific
 * tokens and makes no judgement about whether a finding is good or bad. Adding
 * support for a new contract shape means adding a JSON file, not editing this.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Capability, ChainFamily, Observation } from '../types.js';
import { RpcClient, ethCall, ethGetStorageAt, wordToAddress, isBurnAddress } from '../sources/rpc.js';
import { findDataDir, DataRootError } from '../data-root.js';

export interface PatternMethod {
  kind: 'storage-slot' | 'call-selector' | 'account-field' | 'account-extension';
  storageSlot?: string;
  slotDerivation?: string;
  callSelector?: string;
  signature?: string;
  accountField?: string;
  /** account-extension: the `extension` string the RPC returns, e.g. `permanentDelegate`. */
  extension?: string;
  /** account-extension: the field to read inside that extension's `state` object. */
  extensionField?: string;
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
  presenceIndicatedBy?: 'non-empty-value' | 'call-success' | 'extension-present';
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

  let root: string;
  if (baseDir) {
    root = baseDir;
  } else {
    try {
      root = await findDataDir('patterns');
    } catch (err) {
      if (err instanceof DataRootError) throw new PatternLoadError(err.message);
      throw err;
    }
  }

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
    if (pattern.method.kind === 'account-extension') {
      const observation = readExtension(mintAccount, pattern, now);
      if (observation !== null) observations.push(observation);
      continue;
    }

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

/**
 * The Token-2022 extension list on a mint account, or null if there is none.
 *
 * Returns null for two different situations that must not be confused: a mint
 * owned by the legacy Token program, which can never carry an extension, and a
 * mint we could not read at all. The caller separates them; this only reports
 * that no list is available.
 */
function extensionList(mintAccount: Record<string, unknown> | null): unknown[] | null {
  if (mintAccount === null) return null;
  const value = readPath(mintAccount, 'data.parsed.info.extensions');
  return Array.isArray(value) ? value : null;
}

/**
 * Read one Token-2022 extension off a mint.
 *
 * The three outcomes are deliberately distinct, because collapsing any two of
 * them would be this project's own absence-is-never-safety error:
 *
 *   null       (returned, not a value) the mint is a legacy Token mint, so the
 *              extension is not a question about it. No observation at all.
 *   undefined  we never read the account. UNKNOWN, and it reduces coverage.
 *   null       we read the account and the extension is genuinely not on it.
 *              This is the one place on Solana where absence really is absence:
 *              the extension list is the complete set of extensions a mint
 *              carries, so a name missing from it is verified as not present,
 *              not merely unobserved.
 *   a value    the extension is configured, and this is its authority.
 *
 * `presenceIndicatedBy: extension-present` is the Solana counterpart of
 * `call-success`. A transfer fee currently set to 0 basis points is still a fee
 * mechanism with a live authority behind it, exactly as `paused()` returning
 * false is still a pause mechanism. What is scored is the power, not whether it
 * happens to be exercised at this instant.
 */
function readExtension(
  mintAccount: Record<string, unknown> | null,
  pattern: Pattern,
  now: string
): Observation | null {
  const { extension, extensionField } = pattern.method;
  const base = {
    capability: pattern.capability,
    source: 'onchain' as const,
    patternId: pattern.id,
    observedAt: now,
  };

  if (mintAccount === null) {
    return { ...base, value: undefined, method: `extension ${extension} unavailable, account not fetched` };
  }
  if (!extension) {
    return { ...base, value: undefined, method: 'pattern declares no extension to read' };
  }

  const list = extensionList(mintAccount);
  if (list === null) {
    // A legacy Token mint carries no extensions at all, so this pattern is not
    // inapplicable-and-unknown, it is simply not a question about this mint.
    // Returning null drops the observation entirely.
    //
    // Neither other answer is honest here. `null` as a value would mean "we
    // checked and it is not there", and downstream a single definite miss
    // outweighs any number of could-not-looks — so a Token-2022 pattern
    // reporting null on a legacy mint would flip the capability to ABSENT on
    // the strength of a check that could not have found anything. That is how
    // USDC came to report metadata-mutability as absent while the Metaplex
    // account, the only place the answer could live, went unread. And
    // `undefined` would be no better: it would add a capability to the
    // denominator that this mint could never have scored, so every legacy token
    // would appear less covered purely because the dictionary learned about a
    // program it does not use.
    return null;
  }

  const found = list.find(
    (e): e is { extension: string; state?: Record<string, unknown> } =>
      typeof e === 'object' && e !== null && (e as { extension?: unknown }).extension === extension
  );

  if (!found) {
    return { ...base, value: null, method: `${extension} is not among this mint's extensions` };
  }

  if (pattern.presenceIndicatedBy === 'extension-present') {
    return {
      ...base,
      value: `mechanism present, ${describeExtension(found.state)}`,
      method: `${extension} is configured on the mint, so the capability is built in`,
    };
  }

  const raw = extensionField ? found.state?.[extensionField] : undefined;
  const value = typeof raw === 'string' && raw.length > 0 ? raw : null;

  return {
    ...base,
    value,
    method: `${extension}.${extensionField ?? '?'}`,
  };
}

/**
 * One line describing an extension's current configuration.
 *
 * Kept short and free of judgement: it goes into the reasoning a reader sees,
 * and its job is to stop `extension-present` reporting a bare "present" with no
 * indication of what is actually set. Rendering the whole state object here is
 * what produced a reasoning string of eight `[object Object]`s.
 */
function describeExtension(state: Record<string, unknown> | undefined): string {
  if (!state) return 'no configuration recorded';

  // One level of nesting is flattened rather than skipped, because the field
  // that matters most on a transfer fee lives one level down: reporting only
  // the authorities would let a mint with a 100% fee already scheduled in
  // `newerTransferFee` summarise identically to one charging nothing.
  const parts: string[] = [];
  const push = (key: string, value: unknown): void => {
    if (value === null) parts.push(`${key} not set`);
    else if (typeof value === 'string')
      parts.push(`${key} ${value.length > 12 ? value.slice(0, 10) + '...' : value}`);
    else if (typeof value === 'number' || typeof value === 'boolean') parts.push(`${key} ${value}`);
  };

  for (const [key, value] of Object.entries(state)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        push(`${key}.${inner}`, innerValue);
      }
    } else {
      push(key, value);
    }
  }

  // Authorities first. The summary is truncated, and who holds the power
  // matters more to a reader than which epoch the current setting dates from —
  // on a transfer fee the raw field order buries both authorities behind four
  // bookkeeping numbers.
  const rank = (part: string): number => (/authority|delegate/i.test(part) ? 0 : 1);
  parts.sort((a, b) => rank(a) - rank(b));

  return parts.length > 0 ? `currently ${parts.slice(0, 4).join(', ')}` : 'configuration not readable as a summary';
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
