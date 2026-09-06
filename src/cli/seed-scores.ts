#!/usr/bin/env node
/**
 * Scores every registry token and prints the result as a table or JSON.
 *
 *   npm run seed-scores            table
 *   npm run seed-scores -- --json  machine-readable, for diffing across versions
 *
 * CONTRIBUTING.md requires a before/after table of the seed set for any
 * methodology change. This is how that table is produced, from live reads
 * rather than from memory. It needs network, so it runs in the nightly job
 * and by hand, never as a merge gate.
 */

import { loadRegistry } from '../registry/lookup.js';
import { analyse } from '../pipeline.js';
import type { Axis, Capability, SignalState } from '../types.js';

const PAUSE_MS = 400;

export interface SeedScore {
  id: string;
  chain: string;
  symbol: string;
  axes: Record<Axis, number | 'n/a'>;
  coverage: string;
  gaps: number;
  gapScan: string;
  signals: Partial<Record<Capability, SignalState>>;
  error?: string;
}

async function main(): Promise<void> {
  const json = process.argv.includes('--json');
  const entries = await loadRegistry();
  const rows: SeedScore[] = [];

  for (const entry of entries) {
    try {
      const s = await analyse(entry.chain, entry.address);
      const axis = (a: Axis): number | 'n/a' => (s.axes[a].assessed ? s.axes[a].value : 'n/a');
      rows.push({
        id: entry.id,
        chain: entry.chain,
        symbol: entry.symbol,
        axes: { control: axis('control'), transparency: axis('transparency'), exit: axis('exit') },
        coverage: `${s.coverage.scored}/${s.coverage.applicable}`,
        gaps: s.dictionaryGaps.length,
        gapScan: s.gapScan,
        signals: Object.fromEntries(
          (['control', 'transparency', 'exit'] as const).flatMap((a) => s.axes[a].signals).map((x) => [x.capability, x.state])
        ),
      });
    } catch (err) {
      rows.push({
        id: entry.id,
        chain: entry.chain,
        symbol: entry.symbol,
        axes: { control: 'n/a', transparency: 'n/a', exit: 'n/a' },
        coverage: 'NA',
        gaps: 0,
        gapScan: 'error',
        signals: {},
        error: (err as Error).message,
      });
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`\n${'token'.padEnd(18)} ${'ctl'.padStart(4)} ${'trn'.padStart(4)} ${'ext'.padStart(4)} ${'cov'.padStart(6)}  gaps scan`);
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(18)} ${String(r.axes.control).padStart(4)} ${String(r.axes.transparency).padStart(4)} ` +
        `${String(r.axes.exit).padStart(4)} ${r.coverage.padStart(6)}  ${String(r.gaps).padStart(4)} ${r.gapScan}` +
        (r.error ? `  ${r.error.slice(0, 60)}` : '')
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(`seed-scores failed: ${(err as Error).message}`);
  process.exit(1);
});
