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
 * 0.6.0 shipped the reading on a 52-token scan. The first run of this command
 * looked at 400 and found four spellings it had missed, two of which were
 * producing exactly that false clean reading on mainnet. The lesson is not that
 * the list is now right; it is that the list goes stale and the only remedy is
 * to measure again.
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
import { extractSelectors, metadataMutatorSignatures } from '../patterns/selectors.js';
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
 * `PRIVILEGED_FUNCTIONS`, and the four that fired on the first run are already
 * there. Anything still listed here has been looked for and not yet found.
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
  // fires earns a place in PRIVILEGED_FUNCTIONS, which is how the four found
  // in 0.6.0's sweep and the three found in 0.7.0's got there.
  'setTokenInfo(string,string)', 'updateInfo(string,string)', 'setLabel(string)',
  'setDisplayName(string)', 'renameToken(string,string)', 'setBrand(string)',
  'setTokenMetadata(string,string)', 'updateBrand(string)', 'setAvatar(string)',
  'setNameAndImage(string,string)', 'setProfile(string,string)', 'setIcon(string)',
  'setExternalURL(string)', 'setWebsite(string)', 'setProjectURI(string)',
];

/** Proxy slots the dictionary knows. A hit on any of them means the code can move. */
const PROXY_SLOTS = {
  eip1967: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  zeppelinos: '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3',
  beacon: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
  admin: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',
};
/** A beacon holds the beacon, and an admin slot an admin. Neither is the code. */
const SLOTS_HOLDING_CODE = [PROXY_SLOTS.eip1967, PROXY_SLOTS.zeppelinos];

const UPGRADE_FUNCTIONS = [
  'upgradeTo(address)', 'upgradeToAndCall(address,bytes)', 'setImplementation(address)', 'changeAdmin(address)',
];

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
  fromBlock: number;
  blocks: number;
  tokensScanned: number;
  bytecodeFixed: number;
  upgradeable: number;
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

async function sampleTokens(client: RpcClient, blocks: number, want: number, quiet: boolean): Promise<{ latest: number; tokens: { address: string; symbol: string; calls: number }[] }> {
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
    if (!block?.transactions) continue;
    for (const tx of block.transactions) {
      if (!tx.to) continue;
      const to = tx.to.toLowerCase();
      calls.set(to, (calls.get(to) ?? 0) + 1);
    }
    if (!quiet && i % 10 === 0) process.stderr.write('.');
  }
  if (!quiet) process.stderr.write('\n');

  const tokens: { address: string; symbol: string; calls: number }[] = [];
  for (const [address, count] of [...calls.entries()].sort((a, b) => b[1] - a[1])) {
    if (tokens.length >= want) break;
    // decimals and totalSupply together separate a token from a router, a
    // multisig or a wallet; symbol gives the report something to print.
    const answered = async (selector: string): Promise<string | null> => {
      const result = await ethCall(client, address, selector).catch(() => null);
      return result && result.ok && result.data !== '0x' ? result.data : null;
    };

    const decimals = await answered(DECIMALS);
    if (decimals === null) continue;
    const places = parseInt(decimals.slice(2), 16);
    if (!Number.isFinite(places) || places > 36) continue;
    if ((await answered(TOTAL_SUPPLY)) === null) continue;
    const symbolData = await answered(SYMBOL);
    if (symbolData === null) continue;
    const symbol = (decodeSymbol(symbolData) ?? '?').replace(/[^\x20-\x7e]/g, '').slice(0, 24) || '?';
    tokens.push({ address, symbol, calls: count });
    if (!quiet) process.stderr.write('+');
  }
  if (!quiet) process.stderr.write('\n');
  return { latest, tokens };
}

export async function sweep(options: { blocks: number; tokens: number; quiet: boolean }): Promise<SweepResult> {
  const client = new RpcClient({ endpoints: DEFAULT_EVM_ENDPOINTS });
  // Loading the dictionary is not strictly needed to scan, but a sweep that
  // silently ran against a broken install would report a reassuring zero.
  await loadPatterns();

  const shipped = new Set(metadataMutatorSignatures());
  const candidates = new Map<string, string>();
  for (const signature of [...shipped, ...WATCHLIST]) candidates.set(selectorOf(signature), signature);
  const upgradeSelectors = new Set(UPGRADE_FUNCTIONS.map(selectorOf));

  const { latest, tokens } = await sampleTokens(client, options.blocks, options.tokens, options.quiet);

  const hits: SweepHit[] = [];
  let scanned = 0;
  let fixed = 0;
  let upgradeableCount = 0;

  for (const token of tokens) {
    const code = await ethGetCode(client, token.address).catch(() => null);
    if (code === null || code === '0x') continue;

    const selectors = new Set<string>(extractSelectors(code));
    let proxied = false;
    for (const [, slot] of Object.entries(PROXY_SLOTS)) {
      const word = await ethGetStorageAt(client, token.address, slot).catch(() => null);
      const target = word === null ? null : wordToAddress(word);
      if (!target) continue;
      proxied = true;
      if (!SLOTS_HOLDING_CODE.includes(slot)) continue;
      const implementation = await ethGetCode(client, target).catch(() => null);
      if (implementation && implementation !== '0x') {
        for (const selector of extractSelectors(implementation)) selectors.add(selector);
      }
    }
    const upgradeable = proxied || [...upgradeSelectors].some((selector) => selectors.has(selector));

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
    fromBlock: latest,
    blocks: options.blocks,
    tokensScanned: scanned,
    bytecodeFixed: fixed,
    upgradeable: upgradeableCount,
    hits,
    falseCleanCount: hits.filter(isFalseClean).length,
    signaturesChecked: candidates.size,
  };
}

function render(result: SweepResult): void {
  console.log();
  console.log(`${BOLD}Metadata-mutator sweep${RESET}  ${DIM}${result.tokensScanned} tokens from ${result.blocks} blocks ending ${result.fromBlock}${RESET}`);
  console.log(`${DIM}${result.signaturesChecked} signatures checked: the shipped table plus the watchlist${RESET}`);
  console.log();
  console.log(`  bytecode fixed      ${result.bytecodeFixed}   ${DIM}an absence is readable on these${RESET}`);
  console.log(`  upgradeable         ${result.upgradeable}   ${DIM}the absence is refused, so a missed spelling costs nothing${RESET}`);
  console.log(`  carrying a mutator  ${result.hits.length}`);
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
