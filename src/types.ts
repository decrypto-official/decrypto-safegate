/**
 * Core vocabulary for Safegate.
 *
 * Two rules are encoded in these types rather than left to discipline:
 *
 *  1. `SignalState` has no boolean. A capability is PRESENT, ABSENT, EXPECTED or
 *     UNKNOWN. There is deliberately no way to express "missing, therefore fine".
 *  2. `Score` always carries `coverage` and `reasoning`. There is no type in this
 *     file that represents a bare number, so the API cannot accidentally return one.
 */

export type ChainFamily = 'evm' | 'solana';
export type Chain = 'ethereum' | 'solana';

export type Capability =
  | 'upgradeability'
  | 'mint-authority'
  | 'freeze-authority'
  | 'admin-authority'
  | 'metadata-mutability'
  | 'transfer-restriction'
  | 'fee-control';

/** The three axes. See METHODOLOGY.md for the capability to axis mapping. */
export type Axis = 'control' | 'transparency' | 'exit';

/**
 * PRESENT  the capability exists and nothing justifies it
 * ABSENT   verified as revoked or never present
 * EXPECTED the capability exists AND a registry entry justifies it
 * UNKNOWN  we could not determine it. Never treat as ABSENT.
 */
export type SignalState = 'PRESENT' | 'ABSENT' | 'EXPECTED' | 'UNKNOWN';

export type SourceId = 'onchain' | 'goplus' | 'rugcheck';

/** A raw reading from one source, before any interpretation. */
export interface Observation {
  capability: Capability;
  /** null means the source looked and found nothing. undefined means it could not look. */
  value: string | number | boolean | null | undefined;
  source: SourceId;
  /** Which pattern produced this, when the source is on-chain. */
  patternId?: string;
  /** Human readable note about how it was read. */
  method?: string;
  observedAt: string;
}

/** An interpreted signal. Carries its own provenance and its own doubt. */
export interface Signal {
  capability: Capability;
  state: SignalState;
  axis: Axis;
  /** Every observation that fed this signal, including ones that disagreed. */
  observations: Observation[];
  /** Plain English, shown to the reader. Never omitted. */
  reasoning: string;
  /** Present when the registry justified an otherwise-PRESENT capability. */
  expectedBecause?: string;
  constrainedBy?: string;
}

/** Two sources gave different answers for the same capability. Surfaced, never resolved silently. */
export interface Disagreement {
  capability: Capability;
  /** Our own on-chain reading. */
  ours: { value: unknown; source: SourceId; patternId?: string };
  /** What the third party claims. */
  theirs: { value: unknown; source: SourceId };
  note: string;
}

/**
 * A value we could not verify ourselves, shown next to our UNKNOWN.
 * This is the Solana concentration case: we report UNKNOWN, and display
 * RugCheck's figure beside it under attribution, never merged into ours.
 */
export interface UnverifiedReference {
  label: string;
  value: unknown;
  source: SourceId;
  caveat: string;
}

export interface AxisResult {
  axis: Axis;

  /**
   * False when nothing on this axis resolved, which is not the same as a clean
   * axis. Read this before `value`.
   *
   * `value` is 0 in that case by arithmetic, and 0 is the best score the model
   * can produce, so an unassessed axis is indistinguishable from a checked and
   * clean one to anything reading `value` alone. That is the same failure the
   * `incident` field avoids by refusing to be a number at all. The axes cannot
   * take that route without breaking the score shape, so they carry the
   * distinction in a separate field instead.
   */
  assessed: boolean;

  /** 0 to 100. Higher is always worse, on every axis. Meaningless when `assessed` is false. */
  value: number;

  /** Signals scored / signals applicable. UNKNOWN signals are excluded from the numerator. */
  coverage: { scored: number; applicable: number; ratio: number };
  signals: Signal[];
}

export interface Score {
  chain: Chain;
  address: string;
  symbol?: string;
  name?: string;

  axes: Record<Axis, AxisResult>;

  /** Overall coverage across all axes. Never omitted, never separable from the axes. */
  coverage: { scored: number; applicable: number; ratio: number };

  /**
   * Model 1's incident axis. Deliberately not a number.
   * A bare 0 would read as "no incidents, therefore safe", which is false for a
   * fresh token. Until a history adapter exists this stays as a literal.
   */
  incident: 'insufficient-data' | { flags: string[] };

  disagreements: Disagreement[];
  unverified: UnverifiedReference[];

  registryEntry: { id: string; archetype: string; approvedBy: string; verifiedAt: string } | null;

  methodologyVersion: string;
  inputSnapshotHash: string;
  computedAt: string;

  /** What this score does not and cannot tell you. Always present. */
  limitations: string[];
}
