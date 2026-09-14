/**
 * The pipeline. sources -> patterns -> signals -> registry -> scoring.
 *
 * All the I/O lives here so that scoring/model2.ts can stay pure.
 */

import { createHash } from 'node:crypto';
import type { Chain, DictionaryGap, GapScanStatus, Observation, Score, UnverifiedReference } from './types.js';
import { RpcClient, DEFAULT_EVM_ENDPOINTS, ethCall, ethGetCode, classifyCode } from './sources/rpc.js';
import { solanaClient, fetchMint, fetchTokenMetadata, type TokenMetaRecord } from './sources/solana.js';
import {
  loadPatterns,
  applyEvmPatterns,
  applySolanaPatterns,
  fillMissingCapabilities,
  settleEvmMetadataMutability,
  type EvmSurface,
} from './patterns/resolve.js';
import {
  findDictionaryGaps,
  implementationAddresses,
  extractSelectors,
  dispatchesUpgradeFunction,
  type ImplementationCode,
} from './patterns/selectors.js';
import { findExtensionGaps } from './patterns/extensions.js';
import { loadRegistry, findEntry, isStale } from './registry/lookup.js';
import { normalise, isPositive } from './signals/normalise.js';
import { score } from './scoring/model2.js';
import { UnscoreableAddressError } from './errors.js';

export { UnscoreableAddressError } from './errors.js';

export interface AnalyseOptions {
  evmEndpoints?: string[];
  solanaEndpoints?: string[];
}

export async function analyse(chain: Chain, address: string, options: AnalyseOptions = {}): Promise<Score> {
  const patterns = await loadPatterns();
  const registry = await loadRegistry();
  const entry = findEntry(registry, chain, address);

  let observations: Observation[];
  let symbol: string | undefined;
  let name: string | undefined;
  const unverified: UnverifiedReference[] = [];
  let dictionaryGaps: DictionaryGap[] = [];
  let gapScan: GapScanStatus = 'not-applicable';

  if (chain === 'ethereum') {
    const client = new RpcClient({ endpoints: options.evmEndpoints ?? DEFAULT_EVM_ENDPOINTS });

    // Code first. An address with no contract scores 0 on every axis at full
    // coverage, because every probe reads "checked, nothing there". That is the
    // best-looking result the tool can print, so it must not be printed for a
    // wallet. If the code read itself fails we cannot tell, and proceed with
    // the gap scan marked failed, as before.
    const bytecode = await ethGetCode(client, address).catch(() => null);
    if (bytecode !== null) {
      const kind = classifyCode(bytecode);
      if (kind === 'none') {
        throw new UnscoreableAddressError(chain, address, 'no-code',
          `${address} has no contract code on Ethereum. It is a wallet or an unused address, not a token, so there is nothing to score.`);
      }
      if (kind === 'eip7702-delegation') {
        throw new UnscoreableAddressError(chain, address, 'eip7702-delegation',
          `${address} is a wallet carrying an EIP-7702 delegation, not a token contract, so there is nothing to score.`);
      }
    }

    const [patternReads, symbolRead] = await Promise.all([
      applyEvmPatterns(client, address, patterns),
      readErc20Symbol(client, address),
    ]);

    symbol = symbolRead ?? entry?.symbol;
    name = entry?.name;

    // A proxy's bytecode dispatches its upgrade functions and nothing else;
    // the privileged surface is in the implementation its slot points at.
    // Read that too, or a proxied token's gap scan is empty by construction.
    // A failed read of either is a failed scan; what was read is still
    // reported.
    //
    // This runs before the capabilities are settled, because since 0.6.0 the
    // dispatch surface it produces is what decides metadata mutability.
    // `implementationAddresses` only reads observations a pattern produced, so
    // the pattern reads alone answer it.
    const implementations: ImplementationCode[] = [];
    let implementationUnread = false;
    for (const implementation of implementationAddresses(patterns, patternReads)) {
      const code = await ethGetCode(client, implementation).catch(() => null);
      if (code === null) implementationUnread = true;
      else implementations.push({ address: implementation, bytecode: code });
    }

    const surface = evmSurface(bytecode, implementations, implementationUnread, patternReads);
    observations = fillMissingCapabilities(
      settleEvmMetadataMutability(patternReads, surface),
      'evm',
      patterns
    );

    if (bytecode === null) {
      gapScan = 'failed';
    } else {
      gapScan = implementationUnread ? 'failed' : 'ran';
      dictionaryGaps = findDictionaryGaps(bytecode, patterns, observations, implementations);
    }
  } else {
    const client = solanaClient(options.solanaEndpoints);
    const mint = await fetchMint(client, address);

    if (!mint.exists) {
      throw new UnscoreableAddressError(chain, address, 'no-account',
        `${address} has no account on Solana. Nothing exists at this address, so there is nothing to score.`);
    }
    if (mint.accountType !== 'mint') {
      const what =
        mint.accountType === 'account'
          ? 'a token holder account'
          : mint.accountType
            ? `a ${mint.accountType} account`
            : `an account owned by ${mint.programId || 'an unknown program'} that the node returned without parsing; Safegate reads only parsed token mints`;
      throw new UnscoreableAddressError(chain, address, 'not-a-mint',
        `${address} is ${what}, not a token mint, so there is nothing to score.`);
    }

    // The metadata account is where name, symbol, URI and their update
    // authority live. Before 0.2.0 it was never fetched, so metadata
    // mutability was UNKNOWN on every Solana token. A failed read stays
    // UNKNOWN; a missing account is a verified absence.
    let tokenMeta: TokenMetaRecord | null = null;
    try {
      tokenMeta = await fetchTokenMetadata(client, address);
    } catch {
      tokenMeta = null;
    }

    const patternReads = await applySolanaPatterns(
      mint.raw,
      tokenMeta ? (tokenMeta as unknown as Record<string, unknown>) : null,
      patterns
    );
    observations = fillMissingCapabilities(patternReads, 'solana', patterns, {
      legacySolanaMint: !mint.isToken2022,
    });

    symbol = entry?.symbol ?? tokenMeta?.symbol ?? undefined;
    name = entry?.name ?? tokenMeta?.name ?? undefined;

    // The Solana counterpart of the bytecode scan. A legacy Token mint counts
    // as scanned with no gaps: its whole privileged surface is the two
    // authorities the dictionary reads.
    gapScan = 'ran';
    dictionaryGaps = findExtensionGaps(mint.raw, patterns, observations);

    // Holder concentration is not obtainable from our own reading: the public
    // RPC rate limits getTokenLargestAccounts. Declared rather than omitted.
    // No third-party figure is fetched; the value stays null.
    unverified.push({
      label: 'Holder concentration',
      value: null,
      source: 'rugcheck',
      caveat:
        'We could not verify holder concentration ourselves. The public Solana RPC rate limits the ' +
        'call required (getTokenLargestAccounts). No third-party figure is fetched in this version. ' +
        'Any figure shown here comes from a third party, has not been independently confirmed by Safegate, ' +
        'and is not included in the score.',
    });
  }

  const { signals, disagreements } = normalise(observations, entry);

  if (entry && isStale(entry)) {
    unverified.push({
      label: 'Registry entry',
      value: entry.id,
      source: 'onchain',
      caveat:
        `The registry entry for this token passed its review date (${entry.reviewDue}). ` +
        `It no longer grants expected-capability status, and the token is scored on structure alone.`,
    });
  }

  return score({
    chain,
    address,
    ...(symbol ? { symbol } : {}),
    ...(name ? { name } : {}),
    signals,
    disagreements,
    unverified,
    registryEntry: entry
      ? { id: entry.id, archetype: entry.archetype, approvedBy: entry.approvedBy, verifiedAt: entry.verifiedAt }
      : null,
    inputSnapshotHash: snapshotHash(observations),
    computedAt: new Date().toISOString(),
    dictionaryGaps,
    gapScan,
  });
}

/**
 * The contract's complete dispatch surface, or undefined if it is not complete.
 *
 * Undefined whenever anything behind it failed to read: no bytecode, or an
 * implementation we know about but could not fetch. A surface with a hole in
 * it looks exactly like a surface with nothing in it, and the difference is
 * the whole value of the absence it would license.
 *
 * `bytecodeFixed` is deliberately pessimistic. Three independent things each
 * make it false, because each is a way the code that runs could change, and
 * being wrong in this direction only costs coverage while being wrong in the
 * other publishes a clean reading of a token that can rewrite itself.
 */
function evmSurface(
  bytecode: string | null,
  implementations: ImplementationCode[],
  implementationUnread: boolean,
  patternReads: Observation[]
): EvmSurface | undefined {
  if (bytecode === null || implementationUnread) return undefined;

  const selectors = new Set<string>(extractSelectors(bytecode));
  for (const impl of implementations) {
    for (const selector of extractSelectors(impl.bytecode)) selectors.add(selector);
  }

  const upgradeable =
    implementations.length > 0 ||
    patternReads.some((o) => o.capability === 'upgradeability' && isPositive(o.value)) ||
    dispatchesUpgradeFunction(selectors);

  return { selectors, bytecodeFixed: !upgradeable };
}

/**
 * The input snapshot hash, recomputable by anyone from the observations in
 * the published score.
 *
 * Canonical form: every on-chain observation as
 * `[capability, patternId or null, value]`, where a value that could not be
 * read is the string "unavailable", sorted by capability then pattern id,
 * JSON-serialised, SHA-256, first 32 hex characters. The same rule on both
 * chains. Timestamps and method notes are excluded so two reads of an
 * unchanged contract hash identically.
 */
export function snapshotHash(observations: Observation[]): string {
  const canonical = observations
    .filter((o) => o.source === 'onchain')
    .map((o) => [o.capability, o.patternId ?? null, o.value === undefined ? 'unavailable' : o.value] as const)
    .sort((a, b) => a[0].localeCompare(b[0]) || String(a[1]).localeCompare(String(b[1])));
  return 'sha256:' + createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 32);
}

/** symbol() = 0x95d89b41. Handles both the string and the older bytes32 encoding (MKR). */
async function readErc20Symbol(client: RpcClient, address: string): Promise<string | undefined> {
  try {
    const result = await ethCall(client, address, '0x95d89b41');
    if (!result.ok) return undefined;
    return decodeSymbol(result.data);
  } catch {
    return undefined;
  }
}

/** Decode the return data of symbol(): a dynamic string, or a bytes32 on older contracts. */
export function decodeSymbol(data: string): string | undefined {
  const hex = data.replace(/^0x/, '');
  if (hex.length === 0) return undefined;
  if (hex.length === 64) {
    const text = Buffer.from(hex, 'hex').toString('utf8').replace(/\0+$/, '');
    return text || undefined;
  }
  const offset = parseInt(hex.slice(0, 64), 16) * 2;
  const length = parseInt(hex.slice(offset, offset + 64), 16) * 2;
  if (!Number.isFinite(offset) || !Number.isFinite(length) || length > hex.length) return undefined;
  const text = Buffer.from(hex.slice(offset + 64, offset + 64 + length), 'hex').toString('utf8');
  return text || undefined;
}
