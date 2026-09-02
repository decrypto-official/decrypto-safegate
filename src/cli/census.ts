#!/usr/bin/env node
/**
 * How often does the dictionary actually fall short?
 *
 * 0.1.4 added detection of privileged functions no pattern reads, and left one
 * question open on purpose (METHODOLOGY.md §10): should an unreadable capability
 * reduce the coverage figure? That decision moves every published score, so it
 * needs to be made on real numbers rather than an estimate — how often gaps
 * occur, and how many at a time.
 *
 * This walks the registry and reports, per token, what the scan found. It is a
 * measuring instrument, not a gate: a token with gaps is data, not a failure,
 * and this must never be the reason a build goes red.
 *
 * It needs live RPC, so it is the one part of the suite that cannot run in a
 * sandbox without network. CI is where the numbers come from.
 *
 *   npm run census            readable table
 *   npm run census -- --json  machine-readable, for diffing across runs
 */

import { loadRegistry } from '../registry/lookup.js';
import { analyse } from '../pipeline.js';
import type { Capability, GapScanStatus } from '../types.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';

/** Politeness gap between tokens. Public endpoints rate limit, and a census is bursty. */
const PAUSE_MS = 400;

export interface TokenCensus {
  id: string;
  chain: string;
  symbol: string;
  gapScan: GapScanStatus | 'error';
  gapCount: number;
  capabilities: Capability[];
  signatures: string[];
  /** Present only when the token could not be read at all. */
  error?: string;
}

export interface CensusSummary {
  tokens: number;
  scanned: number;
  notApplicable: number;
  failed: number;
  errored: number;
  withGaps: number;
  totalGaps: number;
  /** How many scanned tokens had at least one gap, as a ratio. */
  gapRate: number;
  byCapability: Record<string, number>;
}

/**
 * Reduce the per-token rows to the numbers the coverage decision needs.
 *
 * Pure, so it can be tested without a network: the reporting logic is the part
 * that would silently mislead if it were wrong.
 */
export function summarise(rows: TokenCensus[]): CensusSummary {
  const scanned = rows.filter((r) => r.gapScan === 'ran');
  const withGaps = scanned.filter((r) => r.gapCount > 0);

  const byCapability: Record<string, number> = {};
  for (const row of rows) {
    for (const capability of row.capabilities) {
      byCapability[capability] = (byCapability[capability] ?? 0) + 1;
    }
  }

  return {
    tokens: rows.length,
    scanned: scanned.length,
    notApplicable: rows.filter((r) => r.gapScan === 'not-applicable').length,
    failed: rows.filter((r) => r.gapScan === 'failed').length,
    errored: rows.filter((r) => r.gapScan === 'error').length,
    withGaps: withGaps.length,
    totalGaps: rows.reduce((n, r) => n + r.gapCount, 0),
    // Denominator is tokens actually scanned. Dividing by all tokens would
    // dilute the rate with Solana entries the scan never applied to.
    gapRate: scanned.length === 0 ? 0 : withGaps.length / scanned.length,
    byCapability,
  };
}

async function censusOne(entry: {
  id: string;
  chain: 'ethereum' | 'solana';
  address: string;
  symbol: string;
}): Promise<TokenCensus> {
  try {
    const score = await analyse(entry.chain, entry.address);
    return {
      id: entry.id,
      chain: entry.chain,
      symbol: entry.symbol,
      gapScan: score.gapScan,
      gapCount: score.dictionaryGaps.length,
      capabilities: [...new Set(score.dictionaryGaps.map((g) => g.capability))],
      signatures: score.dictionaryGaps.map((g) => g.signature),
    };
  } catch (err) {
    // One unreachable token must not cost us the other nineteen. Recorded as
    // `error` rather than folded into `failed`, which means something narrower:
    // we read the token but could not read its bytecode.
    return {
      id: entry.id,
      chain: entry.chain,
      symbol: entry.symbol,
      gapScan: 'error',
      gapCount: 0,
      capabilities: [],
      signatures: [],
      error: (err as Error).message,
    };
  }
}

function render(rows: TokenCensus[], summary: CensusSummary): void {
  console.log(`\n${BOLD}DICTIONARY GAP CENSUS${RESET} ${DIM}(registry seed set)${RESET}\n`);

  for (const row of rows) {
    const label = `${row.symbol} ${DIM}${row.chain}${RESET}`.padEnd(28);

    if (row.gapScan === 'error') {
      console.log(`  ${RED}!${RESET} ${label} ${RED}could not read${RESET} ${DIM}${row.error}${RESET}`);
      continue;
    }
    if (row.gapScan === 'failed') {
      console.log(`  ${RED}!${RESET} ${label} ${RED}bytecode unreadable, not scanned${RESET}`);
      continue;
    }
    if (row.gapScan === 'not-applicable') {
      console.log(`  ${DIM}-${RESET} ${label} ${DIM}scan does not apply on this chain${RESET}`);
      continue;
    }
    if (row.gapCount === 0) {
      console.log(`  ${GREEN}o${RESET} ${label} ${GREEN}scanned, no gaps${RESET}`);
      continue;
    }

    console.log(
      `  ${YELLOW}?${RESET} ${label} ${YELLOW}${row.gapCount} gap${row.gapCount === 1 ? '' : 's'}${RESET} ` +
        `${DIM}${row.capabilities.join(', ')}${RESET}`
    );
    for (const signature of row.signatures) console.log(`      ${DIM}${signature}${RESET}`);
  }

  console.log(`\n${BOLD}SUMMARY${RESET}`);
  console.log(`  tokens           ${summary.tokens}`);
  console.log(`  scanned          ${summary.scanned}`);
  console.log(`  not applicable   ${summary.notApplicable} ${DIM}(no bytecode to read)${RESET}`);
  console.log(`  unreadable       ${summary.failed + summary.errored}`);
  console.log(
    `  with gaps        ${summary.withGaps} of ${summary.scanned} scanned ` +
      `${DIM}(${Math.round(summary.gapRate * 100)}%)${RESET}`
  );
  console.log(`  gaps in total    ${summary.totalGaps}`);

  const byCapability = Object.entries(summary.byCapability).sort((a, b) => b[1] - a[1]);
  if (byCapability.length > 0) {
    console.log(`\n${BOLD}BY CAPABILITY${RESET}`);
    for (const [capability, n] of byCapability) {
      console.log(`  ${capability.padEnd(22)} ${n}`);
    }
  }

  console.log(
    `\n${DIM}These are the numbers METHODOLOGY.md §10 defers to. A high rate argues ` +
      `\n  that gaps should reduce coverage; a rate near zero argues the dictionary ` +
      `\n  already covers the seed set and the question is not urgent.${RESET}\n`
  );
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const registry = await loadRegistry();

  const rows: TokenCensus[] = [];
  for (const entry of registry) {
    rows.push(await censusOne(entry));
    if (PAUSE_MS > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }

  const summary = summarise(rows);

  if (asJson) {
    console.log(JSON.stringify({ summary, tokens: rows }, null, 2));
    return;
  }

  render(rows, summary);

  // Deliberately exits 0 even when tokens could not be read. This measures; it
  // does not gate. A flaky public endpoint must never be the reason a merge is
  // blocked, and a token with gaps is a finding, not a fault.
  if (summary.errored + summary.failed > 0) {
    console.log(
      `${YELLOW}note${RESET} ${summary.errored + summary.failed} token(s) could not be read. ` +
        `The census is incomplete, not failed.\n`
    );
  }
}

main().catch((err) => {
  // Only a total failure reaches here: the registry itself unreadable.
  console.error(`\n${RED}census could not run:${RESET} ${(err as Error).message}\n`);
  process.exit(1);
});
