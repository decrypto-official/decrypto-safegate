/**
 * The pipeline. sources -> patterns -> signals -> registry -> scoring.
 *
 * All the I/O lives here so that scoring/model2.ts can stay pure.
 */

import { createHash } from 'node:crypto';
import type { Chain, DictionaryGap, GapScanStatus, Observation, Score, UnverifiedReference } from './types.js';
import { RpcClient, DEFAULT_EVM_ENDPOINTS, ethCall, ethGetCode } from './sources/rpc.js';
import { solanaClient, fetchMint } from './sources/solana.js';
import { loadPatterns, applyEvmPatterns, applySolanaPatterns } from './patterns/resolve.js';
import { findDictionaryGaps } from './patterns/selectors.js';
import { findExtensionGaps } from './patterns/extensions.js';
import { loadRegistry, findEntry, isStale } from './registry/lookup.js';
import { normalise } from './signals/normalise.js';
import { score } from './scoring/model2.js';

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
  let rawForHash: unknown;
  const unverified: UnverifiedReference[] = [];
  let dictionaryGaps: DictionaryGap[] = [];
  // Each branch sets this. 'not-applicable' survives only where a chain really
  // offers nothing to scan, which is now no chain at all.
  let gapScan: GapScanStatus = 'not-applicable';

  if (chain === 'ethereum') {
    const client = new RpcClient({ endpoints: options.evmEndpoints ?? DEFAULT_EVM_ENDPOINTS });
    observations = await applyEvmPatterns(client, address, patterns);
    // Both reads depend only on the address, so they go out together rather
    // than costing two sequential round trips on the request path.
    //
    // The bytecode read asks what the contract can do that our dictionary
    // cannot see. It is reported beside the score and never folded into it:
    // see the note in scoring/model2.ts. A failure here must not cost the
    // caller their score — not knowing our own blind spots is worse than not
    // reporting them, but it is not worse than returning nothing — so it
    // degrades to null and the score stands on the readings we did get.
    const [symbolRead, bytecode] = await Promise.all([
      readErc20Symbol(client, address),
      ethGetCode(client, address).catch(() => null),
    ]);

    symbol = symbolRead ?? entry?.symbol;
    name = entry?.name;
    rawForHash = observations.map((o) => [o.patternId, o.value]);

    if (bytecode === null) {
      gapScan = 'failed';
    } else {
      gapScan = 'ran';
      dictionaryGaps = findDictionaryGaps(bytecode, patterns, observations);
    }
  } else {
    const client = solanaClient(options.solanaEndpoints);
    const mint = await fetchMint(client, address);
    observations = await applySolanaPatterns(mint.raw, null, patterns);
    symbol = entry?.symbol;
    name = entry?.name;
    rawForHash = { mint: mint.mintAuthority, freeze: mint.freezeAuthority, program: mint.programId };

    // The Solana equivalent of the bytecode scan, and a firmer one: see the
    // header of patterns/extensions.ts. Three outcomes, and the middle one is
    // the reason this is not simply `ran`:
    //
    //   raw === null        we could not read the mint. 'failed'.
    //   no extension list   a legacy Token mint, whose entire privileged
    //                       surface is mintAuthority and freezeAuthority and is
    //                       fully read by the dictionary. 'ran', no gaps — a
    //                       real finding, not an absence of one.
    //   an extension list   a Token-2022 mint. 'ran', gaps are whatever is
    //                       configured on it that no pattern reads.
    if (mint.raw === null) {
      gapScan = 'failed';
    } else {
      gapScan = 'ran';
      dictionaryGaps = findExtensionGaps(mint.raw, patterns, observations);
    }

    // Holder concentration is not obtainable from our own reading: the public RPC
    // permanently rate limits getTokenLargestAccounts. Rather than quietly omitting
    // it, we declare the gap. A RugCheck figure can be attached here by the caller
    // and will be displayed BESIDE our UNKNOWN, never merged into the score.
    unverified.push({
      label: 'Holder concentration',
      value: null,
      source: 'rugcheck',
      caveat:
        'We could not verify holder concentration ourselves. The public Solana RPC rate limits the ' +
        'call required (getTokenLargestAccounts). Any figure shown here comes from a third party and ' +
        'has not been independently confirmed by Safegate. It is not included in the score.',
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
    inputSnapshotHash: hash(rawForHash),
    computedAt: new Date().toISOString(),
    dictionaryGaps,
    gapScan,
  });
}

function hash(value: unknown): string {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

/** symbol() = 0x95d89b41. Handles both the string and the older bytes32 encoding (MKR). */
async function readErc20Symbol(client: RpcClient, address: string): Promise<string | undefined> {
  try {
    const result = await ethCall(client, address, '0x95d89b41');
    if (!result.ok) return undefined;
    const hex = result.data.replace(/^0x/, '');
    if (hex.length === 64) {
      // bytes32, right-padded with zeros
      const bytes = Buffer.from(hex, 'hex');
      const text = bytes.toString('utf8').replace(/\0+$/, '');
      return text || undefined;
    }
    const offset = parseInt(hex.slice(0, 64), 16) * 2;
    const length = parseInt(hex.slice(offset, offset + 64), 16) * 2;
    const text = Buffer.from(hex.slice(offset + 64, offset + 64 + length), 'hex').toString('utf8');
    return text || undefined;
  } catch {
    return undefined;
  }
}
