/**
 * The scorer. Control, Transparency, Exit.
 *
 * THIS FILE MUST STAY PURE. No fetch, no fs, no Date.now, no randomness.
 * Everything it needs arrives as an argument. That is what makes the
 * reproducibility claim testable rather than aspirational: given the same
 * signals and the same methodology version, this returns byte-identical output
 * forever, and a stranger can verify a published score without network access.
 *
 * If you ever need I/O here, you need a different file.
 */

import type { Axis, AxisResult, Disagreement, DictionaryGap, GapScanStatus, Score, Signal, UnverifiedReference, Chain } from '../types.js';
import { CAPABILITY_WEIGHT } from '../signals/normalise.js';

export const METHODOLOGY_VERSION = '0.2.0';

const AXES: Axis[] = ['control', 'transparency', 'exit'];

/** Always present, regardless of the token. These are the honest bounds of the method. */
export const STANDING_LIMITATIONS = [
  'This is a structural reading, not a prediction. It cannot tell you whether a token will rug.',
  'Off-chain risk is invisible here: team intent, custody arrangements, private agreements and hidden unlock schedules.',
  'A high coverage figure means we could check a lot, not that the token is safe.',
  'Registry entries confirm that a capability is expected. They never certify a token as safe or as a good investment.',
  'Absence of an incident is not evidence of safety. Most tokens that later rug have a clean history right up until they do not.',
];

export interface ScoreInput {
  chain: Chain;
  address: string;
  symbol?: string;
  name?: string;
  signals: Signal[];
  disagreements: Disagreement[];
  unverified: UnverifiedReference[];
  registryEntry: { id: string; archetype: string; approvedBy: string; verifiedAt: string } | null;
  /** Hash of the raw source payloads. Caller computes it; this function stays pure. */
  inputSnapshotHash: string;
  /** Caller supplies the timestamp so this function has no clock dependency. */
  computedAt: string;
  /**
   * Privileged functions the contract exposes that no pattern reads. Reported,
   * never scored: see the note where they are attached below. Optional so an
   * existing caller keeps producing byte-identical output.
   */
  dictionaryGaps?: DictionaryGap[];
  /**
   * Whether the scan behind `dictionaryGaps` ran. Defaults to 'not-applicable',
   * which is the honest answer for a caller that did not attempt one.
   */
  gapScan?: GapScanStatus;
}

export function score(input: ScoreInput): Score {
  const axes = {} as Record<Axis, AxisResult>;

  for (const axis of AXES) {
    axes[axis] = scoreAxis(axis, input.signals.filter((s) => s.axis === axis));
  }

  const scored = AXES.reduce((n, a) => n + axes[a].coverage.scored, 0);
  const applicable = AXES.reduce((n, a) => n + axes[a].coverage.applicable, 0);

  const limitations = [...STANDING_LIMITATIONS];

  if (applicable > 0 && scored / applicable < 0.6) {
    limitations.unshift(
      `Coverage is ${pct(scored / applicable)}. Fewer than 60% of the applicable checks resolved, ` +
        `so this score is weak evidence. Read the unresolved signals rather than the numbers.`
    );
  }

  const dictionaryGaps = input.dictionaryGaps ?? [];
  const gapScan: GapScanStatus = input.gapScan ?? 'not-applicable';

  // An empty list is only reassuring when we actually looked. Saying nothing
  // here would let "we could not scan" read exactly like "we scanned and the
  // contract is clean", which is the failure this whole feature exists to
  // prevent, reproduced one level up inside the feature itself.
  if (gapScan !== 'ran') {
    limitations.unshift(
      gapScan === 'failed'
        ? `We could not read this contract's bytecode, so it was not checked for capabilities ` +
            `the dictionary cannot see. The absence of findings below reflects a failed check, not a clean one.`
        : `Scanning for capabilities the dictionary cannot read is not available on this chain, ` +
            `so it was not attempted. An empty finding list here means we did not look, not that there is nothing.`
    );
  }

  // A dictionary gap changes no number anywhere. It is stated in the
  // limitations because that is where a reader is told what the score does not
  // cover, and because a reader who sees only the axes would otherwise take an
  // incomplete reading for a complete one.
  //
  // It deliberately does not reduce coverage. Coverage counts the checks we
  // know how to make; a capability we have no pattern for was never in that
  // denominator, and quietly moving it in would change every published score
  // without a methodology version to explain why.
  if (dictionaryGaps.length > 0) {
    // An unclassified extension has no capability to name. Saying so beats
    // rendering "null" into a sentence a reader is meant to act on.
    const named = [...new Set(dictionaryGaps.map((g) => g.capability))].filter(
      (c): c is NonNullable<typeof c> => c !== null
    );
    const unclassified = dictionaryGaps.filter((g) => g.capability === null).length;
    const capabilities = [
      ...named,
      ...(unclassified > 0 ? [`${unclassified} of a kind this dictionary does not yet classify`] : []),
    ];
    const n = dictionaryGaps.length;
    const plural = n === 1 ? '' : 's';

    // The two surfaces support different claims and must not share a sentence.
    // A selector in bytecode means the contract could do this; an extension on
    // a mint means it is configured to, now. Saying "exposes" of both would
    // understate the Solana case, and saying "is configured with" of both would
    // overstate the EVM one — and overstating is the worse of the two here,
    // because it invents certainty the reading does not have.
    const configured = dictionaryGaps.every((g) => g.surface === 'solana-extension');

    limitations.unshift(
      (configured
        ? `This mint is configured with ${n} extension${plural} that no pattern in the dictionary reads, ` +
          `affecting ${capabilities.join(', ')}. Those powers are switched on now and are unreported, `
        : `This contract exposes ${n} privileged function${plural} ` +
          `that no pattern in the dictionary reads, affecting ${capabilities.join(', ')}. ` +
          `Those capabilities are unaccounted for, not absent, `) +
        `and they are not included in any axis or in the coverage figure. ` +
        `Read dictionaryGaps before treating this score as complete.`
    );
  }

  if (input.disagreements.length > 0) {
    limitations.unshift(
      `${input.disagreements.length} source disagreement${input.disagreements.length === 1 ? '' : 's'} recorded. ` +
        `Where our on-chain reading conflicts with a third party, treat the capability as unresolved.`
    );
  }

  return {
    chain: input.chain,
    address: input.address,
    ...(input.symbol ? { symbol: input.symbol } : {}),
    ...(input.name ? { name: input.name } : {}),
    axes,
    coverage: { scored, applicable, ratio: applicable === 0 ? 0 : scored / applicable },
    // Model 1's incident axis. A literal, never a number.
    // A bare 0 reads as "no incidents, therefore safe", which is false for any
    // fresh token. Until a transaction-history adapter exists, this says so.
    incident: 'insufficient-data',
    disagreements: input.disagreements,
    unverified: input.unverified,
    registryEntry: input.registryEntry,
    methodologyVersion: METHODOLOGY_VERSION,
    inputSnapshotHash: input.inputSnapshotHash,
    computedAt: input.computedAt,
    dictionaryGaps,
    gapScan,
    limitations,
  };
}

/**
 * Axis value is the weighted share of resolvable capability that is actually
 * present and unjustified. Higher is worse, on every axis, always.
 *
 * UNKNOWN signals are excluded from BOTH numerator and denominator. They neither
 * help nor hurt the number, they only reduce coverage. Letting an UNKNOWN push
 * the score down would punish tokens for our own blind spots; letting it push
 * the score up would be the "absence means safe" bug this project exists to
 * avoid. Excluding it and reporting coverage is the only honest option.
 */
function scoreAxis(axis: Axis, signals: Signal[]): AxisResult {
  let weightPresent = 0;
  let weightResolved = 0;
  let scored = 0;

  for (const signal of signals) {
    const weight = CAPABILITY_WEIGHT[signal.capability];

    if (signal.state === 'UNKNOWN') continue;

    scored += 1;
    weightResolved += weight;

    if (signal.state === 'PRESENT') {
      weightPresent += weight;
    }
    // EXPECTED contributes to the denominator but not the numerator: the
    // capability is real and counted as checked, and the registry justifies it.
    // ABSENT contributes to the denominator only.
  }

  const value = weightResolved === 0 ? 0 : Math.round((weightPresent / weightResolved) * 100);

  return {
    axis,
    // Nothing resolved is not a score of zero, and `value` cannot express the
    // difference. Every renderer reads this rather than re-deriving it.
    assessed: scored > 0,
    value,
    coverage: {
      scored,
      applicable: signals.length,
      ratio: signals.length === 0 ? 0 : scored / signals.length,
    },
    signals,
  };
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
