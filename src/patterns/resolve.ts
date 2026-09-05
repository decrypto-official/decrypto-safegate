/**
 * Loads patterns/ and applies them against a live chain.
 *
 * This module executes the dictionary. It knows nothing about specific tokens
 * and makes no judgement about whether a finding is good or bad. Adding a new
 * contract shape means adding a JSON file, not editing this.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Capability, ChainFamily, Observation } from '../types.js';
import { capabilitySchema } from '../scoring/schema.js';
import { RpcClient, ethCall, ethGetStorageAt, wordToAddress, isBurnAddress } from '../sources/rpc.js';
import { findDataDir, DataRootError } from '../data-root.js';

export interface PatternMethod {
  kind: 'storage-slot' | 'call-selector' | 'account-field' | 'account-extension';
  storageSlot?: string;
  slotDerivation?: string;
  callSelector?: string;
  /**
   * Fixed ABI-encoded arguments appended to the selector, for a view function
   * that needs a parameter to be callable at all. Only meaningful with
   * `presenceIndicatedBy: call-success`: the returned value for a dummy
   * argument says nothing, the function answering does.
   */
  callArgs?: string;
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
  coversExamples?: Array<{ chain: string; address: string; symbol: string; observed?: string; verifiedAt?: string }>;
  rationale: string;
  references?: string[];
  addedAt: string;
  addedBy?: string;
}

let cache: Pattern[] | null = null;

/**
 * Thrown when the dictionary cannot be read at all, or holds a pattern that
 * cannot be executed. Loud on purpose: an empty or broken dictionary produces
 * a score with no signals, which reads as a clean bill of health.
 */
export class PatternLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatternLoadError';
  }
}

/** The field each method kind must carry to be executable. */
const REQUIRED_FIELD: Record<PatternMethod['kind'], keyof PatternMethod> = {
  'storage-slot': 'storageSlot',
  'call-selector': 'callSelector',
  'account-field': 'accountField',
  'account-extension': 'extension',
};

/**
 * A pattern that declares a kind without the field that kind reads would be
 * skipped silently at apply time, and its capability would vanish from the
 * applicable count. Refuse to load it instead.
 */
function assertExecutable(pattern: Pattern, file: string): void {
  const required = REQUIRED_FIELD[pattern.method?.kind as PatternMethod['kind']];
  if (!required) {
    throw new PatternLoadError(`pattern ${file}: unknown method kind "${String(pattern.method?.kind)}"`);
  }
  if (!pattern.method[required]) {
    throw new PatternLoadError(`pattern ${file}: method.kind is ${pattern.method.kind} but method.${required} is missing`);
  }
  if (pattern.method.callArgs && pattern.presenceIndicatedBy !== 'call-success') {
    throw new PatternLoadError(
      `pattern ${file}: method.callArgs requires presenceIndicatedBy: call-success, because the value returned for a fixed dummy argument means nothing`
    );
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
      const expected = file.replace(/\.json$/, '');
      if (pattern.id !== expected) {
        throw new Error(`pattern id "${pattern.id}" does not match filename "${expected}" in ${family}/${file}`);
      }
      assertExecutable(pattern, `${family}/${file}`);
      out.push(pattern);
    }
  }

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
 * Apply `nonEmptyMeans` to a raw reading.
 *
 * Default: a non-empty value means the capability is present. With
 * `capability-absent`, a non-empty value is a flag saying the capability was
 * explicitly disabled (for example `mintingFinished() = true`), so a positive
 * read becomes null and an empty read becomes a stated "not disabled".
 */
function interpret(pattern: Pattern, value: string | boolean | null): string | boolean | null {
  if (pattern.nonEmptyMeans !== 'capability-absent') return value;
  const positive = value !== null && value !== false && value !== '' && value !== '0x';
  if (positive) return null;
  return `${pattern.method.signature ?? pattern.method.callSelector ?? 'flag'} is not set, so the capability is not disabled`;
}

/** Whether eth_call returned at least one 32-byte word. */
function hasReturnData(data: string): boolean {
  return data.replace(/^0x/, '').length >= 64;
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
          value: interpret(pattern, addr),
          source: 'onchain',
          patternId: pattern.id,
          method: `eth_getStorageAt ${method.storageSlot.slice(0, 12)}...`,
          observedAt: now,
        });
        continue;
      }

      if (method.kind === 'call-selector' && method.callSelector) {
        const calldata = method.callSelector + (method.callArgs ?? '').replace(/^0x/, '');
        const result = await ethCall(client, address, calldata);
        const label = method.signature ?? method.callSelector;

        if (!result.ok) {
          // A revert is a definite finding about THIS pattern, not about the
          // capability overall: another pattern may still locate it.
          observations.push({
            capability: pattern.capability,
            value: null,
            source: 'onchain',
            patternId: pattern.id,
            method: `${label} reverted, function not present`,
            observedAt: now,
          });
          continue;
        }

        // Empty return data is not an answer. A contract whose fallback accepts
        // any calldata (WETH9's deposit fallback, for one) returns 0x to every
        // selector, and before 0.2.0 that counted as the function existing.
        if (!hasReturnData(result.data)) {
          observations.push({
            capability: pattern.capability,
            value: null,
            source: 'onchain',
            patternId: pattern.id,
            method: `${label} returned no data, function not present (a catch-all fallback answers any selector)`,
            observedAt: now,
          });
          continue;
        }

        // call-success: the function existing proves the capability exists.
        // paused() returning false still means a pause mechanism is built in.
        // non-empty-value: the returned value decides. owner() returning the
        // zero address means ownership really was renounced.
        let value: string | boolean | null;
        let note: string = label;

        if (pattern.presenceIndicatedBy === 'call-success') {
          value = `mechanism present, currently ${summarise(result.data)}`;
          note = `${label} exists, so the capability is built in`;
        } else if (method.returnType === 'address') {
          const addr = wordToAddress(result.data);
          value = isBurnAddress(addr) ? null : addr;
        } else if (method.returnType === 'bool') {
          value = /[1-9a-f]/i.test(result.data.replace(/^0x/, ''));
        } else {
          value = result.data;
        }

        observations.push({
          capability: pattern.capability,
          value: interpret(pattern, value),
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

/** Read the fields Solana patterns point at, from a parsed mint account and its metadata record. */
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

    const isMeta = path.startsWith('tokenMeta.');
    const root = isMeta ? tokenMeta : mintAccount;
    const relative = path.replace(/^tokenMeta\./, '');

    if (root === null) {
      observations.push({
        capability: pattern.capability,
        value: undefined,
        source: 'onchain',
        patternId: pattern.id,
        method: isMeta
          ? `${path} unavailable, the metadata account could not be read`
          : `${path} unavailable, account not fetched`,
        observedAt: now,
      });
      continue;
    }

    const value = readPath(root, relative);
    const note = isMeta && typeof root.note === 'string' ? root.note : path;
    observations.push({
      capability: pattern.capability,
      value: interpret(pattern, (value ?? null) as string | boolean | null),
      source: 'onchain',
      patternId: pattern.id,
      method: note,
      observedAt: now,
    });
  }

  return observations;
}

export interface FillContext {
  /** True for a mint owned by the legacy Token program, which carries no extensions. */
  legacySolanaMint?: boolean;
}

/**
 * Give every capability the methodology defines an observation.
 *
 * A capability with no pattern on this chain family used to produce no
 * observation, so it never entered the applicable count and coverage read
 * 4 of 4 when the dictionary could see 4 of 7. Since methodology 0.2.0 it is
 * emitted as UNKNOWN: "no pattern reads this here", which costs coverage and
 * stays visible.
 *
 * One exception, and it is a verified absence rather than a guess: on a mint
 * owned by the legacy Token program, a capability that only exists as a
 * Token-2022 extension cannot be present. The program has no mechanism for
 * it. Those are recorded as ABSENT with the reason stated.
 */
export function fillMissingCapabilities(
  observations: Observation[],
  family: ChainFamily,
  patterns: Pattern[],
  context: FillContext = {},
  now: string = new Date().toISOString()
): Observation[] {
  const seen = new Set(observations.map((o) => o.capability));
  const out = [...observations];

  for (const capability of capabilitySchema.options) {
    if (seen.has(capability)) continue;

    const candidates = patternsFor(patterns, family, capability);
    const extensionOnly =
      family === 'solana' &&
      context.legacySolanaMint === true &&
      candidates.length > 0 &&
      candidates.every((p) => p.method.kind === 'account-extension');

    if (extensionOnly) {
      out.push({
        capability,
        value: null,
        source: 'onchain',
        method:
          `the legacy Token program has no mechanism for ${capability.replace(/-/g, ' ')}; ` +
          `its whole privileged surface is mint authority and freeze authority, both of which were read`,
        observedAt: now,
      });
      continue;
    }

    out.push({
      capability,
      value: undefined,
      source: 'onchain',
      method: `no pattern in the dictionary reads ${capability.replace(/-/g, ' ')} on ${family}`,
      observedAt: now,
    });
  }

  return out;
}

/**
 * The Token-2022 extension list on a mint account, or null if there is none.
 * Null covers both a legacy mint and an unreadable account; the caller separates them.
 */
function extensionList(mintAccount: Record<string, unknown> | null): unknown[] | null {
  if (mintAccount === null) return null;
  const value = readPath(mintAccount, 'data.parsed.info.extensions');
  return Array.isArray(value) ? value : null;
}

/**
 * Read one Token-2022 extension off a mint.
 *
 * Returns null (no observation) for a legacy mint, because the extension is not
 * a question about it; `fillMissingCapabilities` records the verified absence.
 * Value `undefined` means the account was never read. Value `null` means the
 * extension list was read and the extension is not on it, which on Solana is a
 * real absence: the list is complete.
 *
 * `presenceIndicatedBy: extension-present` is the Solana counterpart of
 * `call-success`: a transfer fee at 0 basis points is still a fee mechanism.
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
  if (list === null) return null;

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
    value: interpret(pattern, value),
    method: `${extension}.${extensionField ?? '?'}`,
  };
}

/**
 * One line describing an extension's current configuration, authorities first.
 * Short and free of judgement: it goes into the reasoning a reader sees.
 */
function describeExtension(state: Record<string, unknown> | undefined): string {
  if (!state) return 'no configuration recorded';

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
