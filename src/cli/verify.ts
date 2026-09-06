/**
 * safegate verify <score.json> [--live]
 *
 * The reproducibility claim as a command. METHODOLOGY §10 says the scorer is
 * a pure function and the snapshot hash can be recomputed from the
 * observations a published score carries. This does both from the file
 * alone: no network, no registry, no clock. The published axes, coverage and
 * limitations either come out byte-identical or the command says which field
 * did not.
 *
 * `--live` reads the chain again and reports whether the contract still
 * observes the same. A difference there is information about the token, not
 * a failure of the score, and is reported as such.
 */

import { readFile } from 'node:fs/promises';
import { safeParseScore } from '../scoring/schema.js';
import { score, METHODOLOGY_VERSION } from '../scoring/model2.js';
import { snapshotHash, analyse } from '../pipeline.js';
import type { Axis, Observation, Score } from '../types.js';

const AXES: Axis[] = ['control', 'transparency', 'exit'];

export interface Check {
  name: string;
  state: 'ok' | 'fail' | 'skipped' | 'note';
  detail: string;
}

export interface VerifyReport {
  checks: Check[];
  /** True when nothing failed. A skipped or noted check does not fail a report. */
  ok: boolean;
}

/**
 * JSON with every object key sorted, so two objects that mean the same thing
 * serialise the same whatever order a file, an API or a hand edit left them in.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}

/** Every observation a score carries, in axis order. */
export function observationsOf(s: Score): Observation[] {
  return AXES.flatMap((axis) => s.axes[axis].signals.flatMap((signal) => signal.observations));
}

/** Recompute a published score from its own contents and compare. Pure. */
export function verifyScore(published: unknown): VerifyReport {
  const checks: Check[] = [];
  const done = () => ({ checks, ok: checks.every((c) => c.state !== 'fail') });

  const parsed = safeParseScore(published);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    checks.push({ name: 'shape', state: 'fail', detail: `not a Safegate score: ${issues}` });
    return done();
  }
  const s = parsed.data as Score;
  checks.push({
    name: 'shape',
    state: 'ok',
    detail: `a methodology ${s.methodologyVersion} score for ${s.symbol ?? s.address} on ${s.chain}, computed ${s.computedAt}`,
  });

  const observations = observationsOf(s);
  const hash = snapshotHash(observations);
  checks.push(
    hash === s.inputSnapshotHash
      ? { name: 'snapshot hash', state: 'ok', detail: `${hash}, recomputed from the ${observations.length} observations in the file` }
      : {
          name: 'snapshot hash',
          state: 'fail',
          detail: `published ${s.inputSnapshotHash}, recomputed ${hash}. The observations in this file do not produce the hash it claims.`,
        }
  );

  if (s.methodologyVersion !== METHODOLOGY_VERSION) {
    checks.push({
      name: 'recompute',
      state: 'skipped',
      detail: `computed under methodology ${s.methodologyVersion}; this build scores under ${METHODOLOGY_VERSION}. The axes cannot be checked across versions. Run a build of ${s.methodologyVersion} to verify them.`,
    });
    return done();
  }

  const recomputed = score({
    chain: s.chain,
    address: s.address,
    ...(s.symbol ? { symbol: s.symbol } : {}),
    ...(s.name ? { name: s.name } : {}),
    signals: AXES.flatMap((axis) => s.axes[axis].signals),
    disagreements: s.disagreements,
    unverified: s.unverified,
    registryEntry: s.registryEntry,
    inputSnapshotHash: s.inputSnapshotHash,
    computedAt: s.computedAt,
    dictionaryGaps: s.dictionaryGaps,
    gapScan: s.gapScan,
  });

  if (canonical(recomputed) === canonical(s)) {
    const axes = AXES.map((a) => `${a} ${s.axes[a].assessed ? s.axes[a].value : 'n/a'}`).join(', ');
    checks.push({
      name: 'recompute',
      state: 'ok',
      detail: `${axes}; coverage ${s.coverage.scored}/${s.coverage.applicable}; ${s.limitations.length} limitations. Byte-identical from the signals in the file.`,
    });
    return done();
  }

  const differing = (Object.keys(recomputed) as Array<keyof Score>).filter(
    (k) => canonical(recomputed[k]) !== canonical(s[k])
  );
  const axisDiffs = AXES.filter((a) => canonical(recomputed.axes[a]) !== canonical(s.axes[a])).map(
    (a) => `${a}: published ${s.axes[a].assessed ? s.axes[a].value : 'n/a'}, recomputed ${recomputed.axes[a].assessed ? recomputed.axes[a].value : 'n/a'}`
  );
  checks.push({
    name: 'recompute',
    state: 'fail',
    detail:
      `the file's ${differing.join(', ')} ${differing.length === 1 ? 'does' : 'do'} not follow from its signals` +
      (axisDiffs.length ? ` (${axisDiffs.join('; ')})` : '') +
      '. Either the file was edited after scoring or it was not produced by this scorer.',
  });
  return done();
}

/**
 * Read the chain again and compare observation by observation. Not part of
 * verifyScore: it needs the network, and a change here means the token moved,
 * not that the score was wrong when it was computed.
 */
export async function compareLive(s: Score): Promise<Check> {
  const fresh = await analyse(s.chain, s.address);
  const before = new Map(observationsOf(s).map((o) => [`${o.capability}|${o.patternId ?? ''}`, o]));
  const after = new Map(observationsOf(fresh).map((o) => [`${o.capability}|${o.patternId ?? ''}`, o]));
  const show = (o: Observation | undefined) => (o === undefined ? 'not read' : o.value === undefined ? 'unavailable' : JSON.stringify(o.value));

  const changed: string[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key);
    const b = after.get(key);
    if (canonical(a?.value === undefined ? 'unavailable' : a.value) !== canonical(b?.value === undefined ? 'unavailable' : b.value)) {
      changed.push(`${key.replace('|', ' via ')}: ${show(a)} then, ${show(b)} now`);
    }
  }

  if (changed.length === 0) {
    return { name: 'live', state: 'ok', detail: `the chain reads the same now as at ${s.computedAt} (snapshot ${fresh.inputSnapshotHash})` };
  }
  return {
    name: 'live',
    state: 'note',
    detail:
      `${changed.length} observation${changed.length === 1 ? '' : 's'} read differently now than at ${s.computedAt}. ` +
      `The score was reproducible as published; the token has changed, or the dictionary has. ` +
      changed.join('; '),
  };
}

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

function label(state: Check['state']): string {
  switch (state) {
    case 'ok': return `${GREEN}[ok     ]${RESET}`;
    case 'fail': return `${RED}[FAIL   ]${RESET}`;
    case 'skipped': return `${YELLOW}[skipped]${RESET}`;
    case 'note': return `${YELLOW}[changed]${RESET}`;
  }
}

export function renderVerify(report: VerifyReport): string {
  return report.checks.map((c) => `${label(c.state)} ${c.name.padEnd(14)} ${DIM}${c.detail}${RESET}`).join('\n');
}

/** The CLI entry. `-` reads stdin. Exit 1 when a check failed. */
export async function runVerify(args: string[]): Promise<void> {
  const file = args.find((a) => !a.startsWith('--'));
  const live = args.includes('--live');
  if (!file) {
    console.error('usage: safegate verify <score.json | -> [--live]');
    process.exit(1);
  }

  let text: string;
  try {
    text = file === '-' ? await readStdin() : await readFile(file, 'utf8');
  } catch (err) {
    console.error(`could not read ${file}: ${(err as Error).message}`);
    process.exit(1);
  }

  let published: unknown;
  try {
    published = JSON.parse(text);
  } catch {
    console.log(renderVerify({ checks: [{ name: 'shape', state: 'fail', detail: `${file} is not JSON` }], ok: false }));
    process.exit(1);
  }

  const report = verifyScore(published);
  if (live && report.ok) {
    report.checks.push(await compareLive(published as Score));
  }
  console.log(renderVerify(report));
  process.exit(report.ok ? 0 : 1);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
