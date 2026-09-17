#!/usr/bin/env node
/**
 * Is the metadata-mutator list still complete enough to license an absence?
 *
 * Since methodology 0.3.0 one reading in this project turns the absence of a
 * selector into a scored value: metadata mutability is ABSENT when a contract's
 * bytecode is fixed and dispatches none of the metadata-mutating signatures in
 * `selectors.ts`. Every other use of that table only reports. This one moves an
 * axis, so the table's completeness is load-bearing in a way it is nowhere else,
 * and LIMITATIONS §5 calls it the weakest claim in the project.
 *
 * It cannot be proved complete. It can be measured, which is what this does.
 *
 * The sample is built from our own reading rather than a third-party token
 * list: recent blocks, every address that was called, ranked by how often, kept
 * if it answers like an ERC-20. Each one's whole dispatch surface is then
 * scanned against the shipped table PLUS a watchlist of spellings nobody has
 * adopted yet. A watchlist entry that fires is the finding: a real token whose
 * metadata can be rewritten and which, until that spelling is adopted, reads as
 * a verified clean absence.
 *
 * 0.6.0 shipped the reading on a 52-token scan against a list of eight
 * spellings. Three 400-token rounds followed. The first found four spellings
 * the list had missed and two tokens publishing a false clean reading on
 * mainnet; the second, run after those four were adopted, found three more
 * spellings and two more such tokens; the third, after the whole watchlist was
 * promoted into the table, found none. The lesson is not that the list is now
 * right. It is that two consecutive rounds each produced spellings nobody had
 * written down, so the list goes stale and measuring again is the only remedy.
 *
 * Like the census, this is a measuring instrument and never a gate. It needs
 * live RPC.
 *
 *   npm run sweep                      150 blocks, up to 400 tokens
 *   npm run sweep -- --blocks 300      look further back
 *   npm run sweep -- --tokens 800      keep more of them
 *   npm run sweep -- --json            machine-readable, for diffing across runs
 */

import { RpcClient, DEFAULT_EVM_ENDPOINTS, ethCall, ethGetCode, ethGetStorageAt, wordToAddress } from '../sources/rpc.js';
import { extractSelectors, metadataMutatorSignatures, dispatchesUpgradeFunction } from '../patterns/selectors.js';
import { selectorOf } from '../sources/keccak.js';
import { loadPatterns } from '../patterns/resolve.js';
import { decodeSymbol } from '../pipeline.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

/** Politeness gap. Public endpoints rate limit, and a sweep is bursty. */
const PAUSE_MS = 60;

/**
 * Spellings that are not in the dictionary's table, kept here to be watched for.
 *
 * These are guesses on purpose. A guess in this list costs nothing: it is never
 * scored, never reported as a gap, and only ever prints here if a real contract
 * turns out to dispatch it. A guess that fires has earned a place in
 * `PRIVILEGED_FUNCTIONS`; every spelling the 2026-09 rounds turned up is
 * already there. Anything still listed here has been looked for and not found.
 *
 * Adding to this list is cheap and strictly reduces the chance of a false clean
 * reading going unnoticed. Adding to the shipped table is the consequential
 * act, and should follow a hit here.
 */
const WATCHLIST: readonly string[] = [
  // Generic numeric setters. Each would be a derived-balance multiplier on the
  // right contract and something entirely unrelated on the wrong one, so they
  // are watched rather than adopted: a name that ambiguous does not belong in a
  // table whose absence licenses a published reading.
  'setIndex(uint256)', 'setMultiplier(uint256)', 'updateMultiplier(uint256)',
  'setRate(uint256)', 'setFactor(uint256)', 'updateIndex(uint256)',
  // Untried spellings for the next round. None has been seen yet; any that
  // fires earns a place in PRIVILEGED_FUNCTIONS, which is how the seven that
  // the 2026-09 rounds turned up got there.
  'setTokenInfo(string,string)', 'updateInfo(string,string)', 'setLabel(string)',
  'setDisplayName(string)', 'renameToken(string,string)', 'setBrand(string)',
  'setTokenMetadata(string,string)', 'updateBrand(string)', 'setAvatar(string)',
  'setNameAndImage(string,string)', 'setProfile(string,string)', 'setIcon(string)',
  'setExternalURL(string)', 'setWebsite(string)', 'setProjectURI(string)',
];

/**
 * The upgradeability surface, read out of the dictionary rather than copied.
 *
 * This command audits a reading the pipeline makes, so it must decide
 * "can this code be replaced" exactly as the pipeline does. A local copy of
 * the slots would agree today and drift the first time a proxy shape is added,
 * and the drift would show up as a false all-clear here rather than as a
 * failure — the worst direction for a measuring instrument.
 *
 * `pointsTo: 'implementation'` marks the slots that hold the code itself; a
 * beacon slot holds the beacon and an admin slot an admin, so those prove the
 * contract is proxied without giving us more bytecode to scan.
 */
function upgradeabilitySlots(patterns: { capability: string; method: { kind: string; storageSlot?: string; pointsTo?: string } }[]): { slot: string; holdsCode: boolean }[] {
  return patterns
    .filter((p) => p.capability === 'upgradeability' && p.method.kind === 'storage-slot' && p.method.storageSlot)
    .map((p) => ({ slot: p.method.storageSlot as string, holdsCode: p.method.pointsTo === 'implementation' }));
}

const SYMBOL = '0x95d89b41';
const DECIMALS = '0x313ce567';
const TOTAL_SUPPLY = '0x18160ddd';

export interface SweepHit {
  symbol: string;
  address: string;
  /** True when the code that runs can be replaced, so the absence is refused anyway. */
  upgradeable: boolean;
  /** Signatures found that the shipped table already knows. */
  known: string[];
  /** Signatures found that it does not. Each is a false clean reading today. */
  novel: string[];
}

export interface SweepResult {
  /** Newest block sampled. The range runs back `blocks` from here. */
  latestBlock: number;
  /** Oldest block sampled, so a reader knows the range without recomputing it. */
  oldestBlock: number;
  blocks: number;
  tokensScanned: number;
  bytecodeFixed: number;
  upgradeable: number;
  /**
   * Tokens dropped because a read behind them failed.
   *
   * Reported rather than swallowed: every one is a token this run could not
   * classify, and a sweep that quietly counted them as clean would be the same
   * absence-is-safety mistake the thing it audits exists to prevent.
   */
  unreadable: number;
  /**
   * Addresses dropped during sampling because a probe failed in transport.
   *
   * On the result rather than only on stderr: --json is the mode meant for
   * diffing runs, and a short sample that does not say it was short is the
   * same swallowed failure `unreadable` exists to surface.
   */
  probeFailures: number;
  hits: SweepHit[];
  /** Tokens reading a clean absence that should not: fixed bytecode, only novel spellings. */
  falseCleanCount: number;
  signaturesChecked: number;
}

/**
 * Split findings into what the table knows and what it does not.
 *
 * Exported so a test can drive the classification without a network.
 */
export function classify(found: string[], shipped: ReadonlySet<string>): { known: string[]; novel: string[] } {
  return {
    known: found.filter((f) => shipped.has(f)),
    novel: found.filter((f) => !shipped.has(f)),
  };
}

/** A hit is a false clean reading when nothing in the table caught it and the code cannot move. */
export function isFalseClean(hit: SweepHit): boolean {
  return !hit.upgradeable && hit.known.length === 0 && hit.novel.length > 0;
}

async function sampleTokens(client: RpcClient, blocks: number, want: number, quiet: boolean): Promise<{ latest: number; probeFailures: number; tokens: { address: string; symbol: string; calls: number }[] }> {
  const latestHex = await client.call<string>('eth_blockNumber', []);
  const latest = parseInt(latestHex, 16);

  const calls = new Map<string, number>();
  for (let i = 0; i < blocks; i += 1) {
    let block: { transactions?: { to?: string | null }[] } | null = null;
    try {
      block = await client.call('eth_getBlockByNumber', ['0x' + (latest - i).toString(16), true]);
    } catch {
      block = null;
    }
    if (!block?.transactions) {
      // A block we could not fetch contributes no addresses. Say so rather
      // than letting a short sample look like a quiet chain.
      if (!quiet) process.stderr.write('x');
      continue;
    }
    for (const tx of block.transactions) {
      if (!tx.to) continue;
      const to = tx.to.toLowerCase();
      calls.set(to, (calls.get(to) ?? 0) + 1);
    }
    if (!quiet && i % 10 === 0) process.stderr.write('.');
  }
  if (!quiet) process.stderr.write('\n');

  const tokens: { address: string; symbol: string; calls: number }[] = [];
  let probeFailures = 0;
  for (const [address, count] of [...calls.entries()].sort((a, b) => b[1] - a[1])) {
    if (tokens.length >= want) break;
    // decimals and totalSupply together separate a token from a router, a
    // multisig or a wallet; symbol gives the report something to print.
    // A revert means "not an ERC-20", which is an answer. A transport failure
    // means we do not know, and must not be read as the same thing: a
    // rate-limited run would otherwise quietly return a short sample and call
    // it a clean measurement.
    let probeFailed = false;
    const answered = async (selector: string): Promise<string | null> => {
      try {
        const result = await ethCall(client, address, selector);
        return result.ok && result.data !== '0x' ? result.data : null;
      } catch {
        probeFailed = true;
        return null;
      }
    };

    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

    const decimals = await answered(DECIMALS);
    if (probeFailed) { probeFailures += 1; continue; }
    if (decimals === null) continue;
    const places = parseInt(decimals.slice(2), 16);
    if (!Number.isFinite(places) || places > 36) continue;
    const supply = await answered(TOTAL_SUPPLY);
    if (probeFailed) { probeFailures += 1; continue; }
    if (supply === null) continue;
    const symbolData = await answered(SYMBOL);
    if (probeFailed) { probeFailures += 1; continue; }
    if (symbolData === null) continue;
    const symbol = (decodeSymbol(symbolData) ?? '?').replace(/[^\x20-\x7e]/g, '').slice(0, 24) || '?';
    tokens.push({ address, symbol, calls: count });
    if (!quiet) process.stderr.write('+');
  }
  if (!quiet) process.stderr.write('\n');
  if (probeFailures > 0 && !quiet) {
    process.stderr.write(`note: ${probeFailures} address(es) could not be probed; the sample is short by that much\n`);
  }
  return { latest, probeFailures, tokens };
}

export async function sweep(options: { blocks: number; tokens: number; quiet: boolean }): Promise<SweepResult> {
  const client = new RpcClient({ endpoints: DEFAULT_EVM_ENDPOINTS });
  // Loading the dictionary is not strictly needed to scan, but a sweep that
  // silently ran against a broken install would report a reassuring zero.
  const patterns = await loadPatterns();

  const shipped = new Set(metadataMutatorSignatures());
  const candidates = new Map<string, string>();
  for (const signature of [...shipped, ...WATCHLIST]) candidates.set(selectorOf(signature), signature);

  const slots = upgradeabilitySlots(patterns as never);

  const { latest, probeFailures, tokens } = await sampleTokens(client, options.blocks, options.tokens, options.quiet);

  const hits: SweepHit[] = [];
  let scanned = 0;
  let fixed = 0;
  let upgradeableCount = 0;
  let unreadable = 0;

  for (const token of tokens) {
    const code = await ethGetCode(client, token.address).catch(() => null);
    if (code === null || code === '0x') {
      unreadable += 1;
      if (!options.quiet) process.stderr.write('x');
      continue;
    }

    const selectors = new Set<string>(extractSelectors(code));
    let proxied = false;
    // A slot that could not be read is not a slot that is empty. Treating a
    // failed read as "no proxy here" would push this token into the fixed
    // column and could invent a false clean reading out of a rate limit, which
    // is precisely the confusion this command exists to catch.
    let slotUnread = false;
    for (const { slot, holdsCode } of slots) {
      let word: string | null;
      try {
        word = await ethGetStorageAt(client, token.address, slot);
      } catch {
        slotUnread = true;
        break;
      }
      const target = wordToAddress(word);
      if (!target) continue;
      proxied = true;
      if (!holdsCode) continue;
      const implementation = await ethGetCode(client, target).catch(() => null);
      if (implementation === null) {
        slotUnread = true;
        break;
      }
      if (implementation !== '0x') {
        for (const selector of extractSelectors(implementation)) selectors.add(selector);
      }
    }
    if (slotUnread) {
      unreadable += 1;
      if (!options.quiet) process.stderr.write('x');
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      continue;
    }

    // dispatchesUpgradeFunction comes from the same table the pipeline uses,
    // so "can this code be replaced" is decided here exactly as it is there.
    const upgradeable = proxied || dispatchesUpgradeFunction(selectors);

    const found: string[] = [];
    for (const [selector, signature] of candidates) if (selectors.has(selector)) found.push(signature);

    scanned += 1;
    if (upgradeable) upgradeableCount += 1;
    else fixed += 1;

    if (found.length > 0) {
      const { known, novel } = classify(found, shipped);
      hits.push({ symbol: token.symbol, address: token.address, upgradeable, known, novel });
      if (!options.quiet) process.stderr.write(novel.length ? '!' : '*');
    } else if (!options.quiet) process.stderr.write('.');

    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  if (!options.quiet) process.stderr.write('\n');

  return {
    latestBlock: latest,
    oldestBlock: latest - options.blocks + 1,
    blocks: options.blocks,
    tokensScanned: scanned,
    bytecodeFixed: fixed,
    upgradeable: upgradeableCount,
    unreadable,
    probeFailures,
    hits,
    falseCleanCount: hits.filter(isFalseClean).length,
    signaturesChecked: candidates.size,
  };
}

function render(result: SweepResult): void {
  console.log();
  console.log(`${BOLD}Metadata-mutator sweep${RESET}  ${DIM}${result.tokensScanned} tokens from blocks ${result.oldestBlock}-${result.latestBlock}${RESET}`);
  console.log(`${DIM}${result.signaturesChecked} signatures checked: the shipped table plus the watchlist${RESET}`);
  console.log();
  console.log(`  bytecode fixed      ${result.bytecodeFixed}   ${DIM}an absence is readable on these${RESET}`);
  console.log(`  upgradeable         ${result.upgradeable}   ${DIM}the absence is refused, so a missed spelling costs nothing${RESET}`);
  console.log(`  carrying a mutator  ${result.hits.length}`);
  if (result.probeFailures > 0) {
    console.log(`  ${YELLOW}unprobed${RESET}            ${result.probeFailures}   ${DIM}sampling could not reach these; the sample is short by that much${RESET}`);
  }
  if (result.unreadable > 0) {
    console.log(`  ${YELLOW}unreadable${RESET}          ${result.unreadable}   ${DIM}a read behind these failed; they are not counted either way${RESET}`);
  }
  console.log();

  if (result.hits.length === 0) {
    console.log(`  ${GREEN}No token in this sample dispatches any metadata mutator.${RESET}`);
  } else {
    for (const hit of result.hits) {
      const flag = isFalseClean(hit) ? `${RED}reads clean, and should not${RESET}` : hit.upgradeable ? `${DIM}upgradeable, UNKNOWN anyway${RESET}` : `${GREEN}caught by the table${RESET}`;
      console.log(`  ${hit.symbol.padEnd(16)} ${DIM}${hit.address}${RESET}  ${flag}`);
      if (hit.known.length) console.log(`      ${DIM}known: ${hit.known.join(', ')}${RESET}`);
      if (hit.novel.length) console.log(`      ${YELLOW}not in the table: ${hit.novel.join(', ')}${RESET}`);
    }
  }

  console.log();
  if (result.falseCleanCount > 0) {
    console.log(`${RED}${result.falseCleanCount} token${result.falseCleanCount === 1 ? '' : 's'} publish a verified clean absence that the bytecode contradicts.${RESET}`);
    console.log(`${DIM}Add the spellings above to PRIVILEGED_FUNCTIONS in src/patterns/selectors.ts.${RESET}`);
  } else {
    console.log(`${GREEN}No false clean reading in this sample.${RESET} ${DIM}That is evidence, not proof: the watchlist is also only a guess.${RESET}`);
  }
  console.log();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const valueOf = (flag: string, fallback: number): number => {
    const at = argv.indexOf(flag);
    if (at === -1) return fallback;
    const parsed = Number(argv[at + 1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const result = await sweep({
    blocks: valueOf('--blocks', 150),
    tokens: valueOf('--tokens', 400),
    quiet: json,
  });

  if (json) console.log(JSON.stringify(result, null, 2));
  else render(result);

  // A measuring instrument, never a gate: a found spelling is data to act on,
  // not a build failure. Exit 0 whatever it found.
}

// census.ts calls main() unconditionally and can, because nothing imports it.
// The offline suite imports `classify` and `isFalseClean` from this file, and
// an unguarded main() would start a live 400-token sweep on `npm test`.
const invoked = process.argv[1] ?? '';
if (invoked.endsWith('sweep.ts') || invoked.endsWith('sweep.js')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
