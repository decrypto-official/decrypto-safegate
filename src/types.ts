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
  /**
   * null means the source looked and found nothing. Absent means it could not
   * look. The key is optional rather than required-and-undefined because
   * JSON.stringify drops an undefined, so after a round trip "could not look"
   * arrives as a missing key. Both forms mean the same thing and neither means
   * ABSENT.
   */
  value?: string | number | boolean | null;
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
  ours: { value?: unknown; source: SourceId; patternId?: string };
  /** What the third party claims. */
  theirs: { value?: unknown; source: SourceId };
  note: string;
}

/**
 * A value we could not verify ourselves, shown next to our UNKNOWN.
 * This is the Solana concentration case: we report UNKNOWN, and display
 * RugCheck's figure beside it under attribution, never merged into ours.
 */
export interface UnverifiedReference {
  label: string;
  value?: unknown;
  source: SourceId;
  caveat: string;
}

/**
 * Whether we scanned the contract for capabilities the dictionary cannot read.
 *
 * An empty `dictionaryGaps` is only reassuring when this is `ran`.
 */
export type GapScanStatus = 'ran' | 'not-applicable' | 'failed';

/**
 * A privileged function a contract exposes that no pattern in the dictionary
 * reads. Evidence that our reading is incomplete, not evidence of a capability.
 */
export interface DictionaryGap {
  /**
   * Which surface this was found on, because the two carry different weight.
   *
   * `evm-selector` means a 4-byte selector appears in the contract's runtime
   * bytecode: the contract can dispatch that function. It does not prove the
   * capability is live, only that our answer is incomplete.
   *
   * `solana-extension` means a Token-2022 extension is configured on the mint
   * right now. That is a stronger statement — not "this contract could do
   * something we cannot read" but "this mint is set up to, and we cannot read
   * it" — and the note says so.
   */
  surface: 'evm-selector' | 'solana-extension';
  /** The raw identifier on that surface: a 4-byte selector, or an extension name. */
  selector: string;
  /** Human-readable: a canonical function signature, or the extension name. */
  signature: string;
  /**
   * The capability this would belong to, if we could read it.
   *
   * `null` only for an extension the dictionary has never classified — a
   * Token-2022 extension shipped after this table was written. Naming a
   * capability for it would be a guess, and dropping it would hide the newest
   * thing on the mint, which is the most likely place for an unread power to
   * be. So it is reported with the capability left open.
   */
  capability: Capability | null;
  note: string;
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

  /**
   * Privileged functions the contract exposes that no pattern reads.
   *
   * Reported, never scored. These do not move an axis, a coverage figure or a
   * signal state: knowing a function exists is not the same as reading who
   * holds it, and inferring one from the other would be exactly the guesswork
   * the dictionary exists to avoid.
   *
   * What it does say is that our answer is incomplete on a specific capability,
   * which is the thing LIMITATIONS.md §5 admits we previously could not see.
   * Empty for Solana, where there is no analogous bytecode to read.
   */
  dictionaryGaps: DictionaryGap[];

  /**
   * Whether the scan behind `dictionaryGaps` actually ran.
   *
   * Without this an empty list means two different things — we looked and
   * found none, and we never looked — and a reader cannot tell which. That is
   * the same conflation of absence with safety that the rest of this file
   * exists to prevent, so it is not left to inference.
   *
   * `not-applicable` is now reached by no chain we support: EVM reads runtime
   * bytecode, and Solana reads the mint's Token-2022 extension list, with a
   * legacy mint counting as scanned because its whole privileged surface is the
   * two authorities the dictionary already reads. The state is kept because a
   * chain added later may genuinely offer nothing to scan, and because older
   * stored scores still carry it.
   * `failed` when the bytecode could not be fetched.
   */
  gapScan: GapScanStatus;

  /** What this score does not and cannot tell you. Always present. */
  limitations: string[];
}
