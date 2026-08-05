/**
 * The pipeline. sources -> patterns -> signals -> registry -> scoring.
 *
 * All the I/O lives here so that scoring/model2.ts can stay pure.
 */

import { createHash } from 'node:crypto';
import type { Chain, DictionaryGap, Observation, Score, UnverifiedReference } from './types.js';
import { RpcClient, DEFAULT_EVM_ENDPOINTS, ethCall, ethGetCode } from './sources/rpc.js';
import { solanaClient, fetchMint } from './sources/solana.js';
import { loadPatterns, applyEvmPatterns, applySolanaPatterns } from './patterns/resolve.js';
import { findDictionaryGaps } from './patterns/selectors.js';
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

  if (chain === 'ethereum') {
    const client = new RpcClient({ endpoints: options.evmEndpoints ?? DEFAULT_EVM_ENDPOINTS });
    observations = await applyEvmPatterns(client, address, patterns);
    symbol = (await readErc20Symbol(client, address)) ?? entry?.symbol;
    name = entry?.name;
    rawForHash = observations.map((o) => [o.patternId, o.value]);

    // Ask what the contract can do that our dictionary cannot read. This is
    // reported beside the score and never folded into it: see the note in
    // scoring/model2.ts.
    //
    // A failure here must not cost the caller their score. Not knowing our own
    // blind spots is worse than not reporting them, but it is not worse than
    // returning nothing, so this degrades to an empty list and the score stands
    // on the readings we did get.
    try {
      const bytecode = await ethGetCode(client, address);
      dictionaryGaps = findDictionaryGaps(bytecode, patterns, observations);
    } catch {
      dictionaryGaps = [];
    }
  } else {
    const client = solanaClient(options.solanaEndpoints);
    const mint = await fetchMint(client, address);
    observations = await applySolanaPatterns(mint.raw, null, patterns);
    symbol = entry?.symbol;
    name = entry?.name;
    rawForHash = { mint: mint.mintAuthority, freeze: mint.freezeAuthority, program: mint.programId };

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
