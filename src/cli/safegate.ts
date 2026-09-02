#!/usr/bin/env node
/**
 * safegate score <chain> <address> [--json]
 *
 * Note what this CLI cannot do: there is no flag that prints only a number.
 * Axes, coverage, reasoning and limitations always travel together. A bare score
 * is the thing that gets screenshotted and misquoted as "Safegate says safe",
 * so it is deliberately not obtainable.
 */

import { analyse } from '../pipeline.js';
import type { Chain, Score, Signal } from '../types.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] !== 'score' || args.length < 3) {
    console.log(`
${BOLD}safegate${RESET}  open, reproducible token risk structure

  ${BOLD}safegate score <chain> <address>${RESET}

  chain     ethereum | solana
  --json    full machine-readable output

  ${DIM}safegate score solana EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v${RESET}
  ${DIM}safegate score ethereum 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48${RESET}
`);
    process.exit(args[0] === 'score' ? 1 : 0);
  }

  const chain = args[1] as Chain;
  const address = args[2] as string;

  if (chain !== 'ethereum' && chain !== 'solana') {
    console.error(`unknown chain "${chain}". use ethereum or solana.`);
    process.exit(1);
  }

  const result = await analyse(chain, address);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  render(result);
}

function render(s: Score): void {
  const title = s.symbol ? `${s.symbol}${s.name ? ` (${s.name})` : ''}` : s.address;
  console.log(`\n${BOLD}${title}${RESET}  ${DIM}${s.chain} ${s.address}${RESET}`);

  if (s.registryEntry) {
    console.log(
      `${DIM}registry:${RESET} ${s.registryEntry.archetype}  ` +
        `${DIM}verified ${s.registryEntry.verifiedAt} by ${s.registryEntry.approvedBy}${RESET}`
    );
  } else {
    console.log(`${DIM}registry: no entry. scored on structure alone.${RESET}`);
  }

  console.log(`\n${BOLD}AXES${RESET} ${DIM}(higher is worse)${RESET}`);
  for (const axis of ['control', 'transparency', 'exit'] as const) {
    const a = s.axes[axis];

    // Nothing resolved is not a score of zero. A blank bar reading "0" would be
    // the best-looking result on the page, produced by having checked nothing.
    if (!a.assessed) {
      console.log(
        `  ${axis.padEnd(13)} ${YELLOW}${'.'.repeat(20)}${RESET} ${YELLOW}n/a${RESET}` +
          `   ${DIM}nothing resolved on this axis${RESET}`
      );
      continue;
    }

    const colour = a.value >= 60 ? RED : a.value >= 30 ? YELLOW : GREEN;
    console.log(
      `  ${axis.padEnd(13)} ${colour}${bar(a.value)}${RESET} ${String(a.value).padStart(3)}` +
        `   ${DIM}${a.coverage.scored}/${a.coverage.applicable} checks resolved${RESET}`
    );
  }

  const cov = Math.round(s.coverage.ratio * 100);
  const covColour = cov >= 80 ? GREEN : cov >= 60 ? YELLOW : RED;
  console.log(
    `\n${BOLD}COVERAGE${RESET}      ${covColour}${cov}%${RESET} ` +
      `${DIM}(${s.coverage.scored} of ${s.coverage.applicable} applicable checks resolved)${RESET}`
  );
  console.log(`${BOLD}INCIDENT${RESET}      ${DIM}${typeof s.incident === 'string' ? s.incident : 'flags present'}${RESET}`);

  console.log(`\n${BOLD}SIGNALS${RESET}`);
  const all = (['control', 'transparency', 'exit'] as const).flatMap((a) => s.axes[a].signals);
  for (const signal of all.sort(byState)) {
    console.log(`  ${stateTag(signal)} ${BOLD}${signal.capability}${RESET} ${DIM}[${signal.axis}]${RESET}`);
    console.log(`      ${DIM}${wrap(signal.reasoning, 74, 6)}${RESET}`);
  }

  if (s.disagreements.length > 0) {
    console.log(`\n${BOLD}${YELLOW}SOURCE DISAGREEMENTS${RESET}`);
    for (const d of s.disagreements) {
      console.log(`  ${YELLOW}!${RESET} ${d.capability}`);
      console.log(`      ours (${d.ours.source}): ${JSON.stringify(d.ours.value)}`);
      console.log(`      ${d.theirs.source}: ${JSON.stringify(d.theirs.value)}`);
      console.log(`      ${DIM}${wrap(d.note, 74, 6)}${RESET}`);
    }
  }

  if (s.unverified.length > 0) {
    console.log(`\n${BOLD}${BLUE}NOT INDEPENDENTLY VERIFIED${RESET} ${DIM}(shown for reference, not scored)${RESET}`);
    for (const u of s.unverified) {
      console.log(`  ${BLUE}~${RESET} ${u.label}: ${u.value === null ? DIM + 'unknown from our side' + RESET : JSON.stringify(u.value)} ${DIM}(${u.source})${RESET}`);
      console.log(`      ${DIM}${wrap(u.caveat, 74, 6)}${RESET}`);
    }
  }

  if (s.dictionaryGaps.length > 0) {
    // The two surfaces do not support the same headline. Bytecode says the
    // contract could do this; an extension list says the mint is configured to.
    const allExtensions = s.dictionaryGaps.every((g) => g.surface === 'solana-extension');
    console.log(
      `\n${BOLD}${YELLOW}NOT READ BY ANY PATTERN${RESET} ` +
        `${DIM}(${
          allExtensions
            ? 'these are switched on now; we cannot see who holds them'
            : 'the contract can do these; we cannot see who holds them'
        })${RESET}`
    );
    for (const gap of s.dictionaryGaps) {
      // A null capability is not a missing field. It means we found a power and
      // cannot say what kind, which has to read as a statement, not a blank.
      const label = gap.capability ?? 'not classified by this dictionary';
      // On Solana the selector is the extension name, so printing both repeats it.
      const suffix = gap.selector === gap.signature ? '' : ` ${gap.selector}`;
      console.log(`  ${YELLOW}?${RESET} ${BOLD}${gap.signature}${RESET} ${DIM}[${label}]${suffix}${RESET}`);
      console.log(`      ${DIM}${wrap(gap.note, 74, 6)}${RESET}`);
    }
  }

  console.log(`\n${BOLD}LIMITATIONS${RESET}`);
  for (const l of s.limitations) console.log(`  ${DIM}- ${wrap(l, 74, 4)}${RESET}`);

  console.log(
    `\n${DIM}methodology ${s.methodologyVersion}  snapshot ${s.inputSnapshotHash}  ${s.computedAt}${RESET}\n`
  );
}

function byState(a: Signal, b: Signal): number {
  const order = { PRESENT: 0, UNKNOWN: 1, EXPECTED: 2, ABSENT: 3 };
  return order[a.state] - order[b.state];
}

function stateTag(s: Signal): string {
  switch (s.state) {
    case 'PRESENT': return `${RED}[PRESENT ]${RESET}`;
    case 'EXPECTED': return `${BLUE}[EXPECTED]${RESET}`;
    case 'ABSENT': return `${GREEN}[ABSENT  ]${RESET}`;
    default: return `${YELLOW}[UNKNOWN ]${RESET}`;
  }
}

function bar(value: number): string {
  const filled = Math.round((value / 100) * 20);
  return '#'.repeat(filled) + '.'.repeat(20 - filled);
}

function wrap(text: string, width: number, indent: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + word).length > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += word + ' ';
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join('\n' + ' '.repeat(indent));
}

main().catch((err) => {
  console.error(`\n${RED}error:${RESET} ${(err as Error).message}\n`);
  process.exit(1);
});
