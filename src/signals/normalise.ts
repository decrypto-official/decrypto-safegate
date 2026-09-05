/**
 * Turns raw observations into tri-state signals.
 *
 * This is where the project's central rule lives: absence is never safety.
 * An observation whose value is `undefined` (we could not look) becomes UNKNOWN
 * and costs coverage. Only an observation that definitely looked and found
 * nothing becomes ABSENT.
 *
 * It is also where multiple patterns for one capability get combined. Reading
 * EIP-1967 alone says USDC is not a proxy; reading the zeppelinos slot says it
 * is. The correct answer is PRESENT, because one pattern finding the capability
 * outweighs several patterns not finding it.
 */

import type { Capability, Disagreement, Observation, Signal, SignalState, Axis } from '../types.js';
import type { RegistryEntry } from '../registry/lookup.js';
import { expectationFor } from '../registry/lookup.js';
import { capabilitySchema } from '../scoring/schema.js';

/**
 * Capability to axis assignment.
 *
 * Some capabilities plausibly belong to two axes. `transfer-restriction` is both
 * insider power and an exit blocker. The rule, per METHODOLOGY.md, is that every
 * capability contributes to exactly ONE axis, chosen as the axis where it does
 * the most damage. Double counting would silently weight a signal twice.
 */
export const CAPABILITY_AXIS: Record<Capability, Axis> = {
  'upgradeability': 'control',
  'mint-authority': 'control',
  'freeze-authority': 'control',
  'admin-authority': 'control',
  'metadata-mutability': 'transparency',
  'transfer-restriction': 'exit',
  'fee-control': 'exit',
};

/**
 * How much each capability contributes to its axis, before normalisation.
 * Published, versioned, and deliberately boring: a stranger must be able to
 * recompute a score by hand from these numbers.
 *
 * metadata-mutability is weighted 1 on purpose. It fires on RAY, JUP and BONK,
 * three well established tokens, so scoring it heavily manufactures false
 * positives across a blue-chip set.
 */
export const CAPABILITY_WEIGHT: Record<Capability, number> = {
  'mint-authority': 10,
  'freeze-authority': 10,
  'admin-authority': 8,
  'upgradeability': 8,
  'transfer-restriction': 7,
  'fee-control': 5,
  'metadata-mutability': 1,
};

export interface NormaliseResult {
  signals: Signal[];
  disagreements: Disagreement[];
}

export function normalise(
  observations: Observation[],
  registryEntry: RegistryEntry | null,
  now: Date = new Date()
): NormaliseResult {
  const byCapability = new Map<Capability, Observation[]>();
  for (const obs of observations) {
    const list = byCapability.get(obs.capability) ?? [];
    list.push(obs);
    byCapability.set(obs.capability, list);
  }

  const signals: Signal[] = [];
  const disagreements: Disagreement[] = [];

  for (const [capability, group] of byCapability) {
    const onchain = group.filter((o) => o.source === 'onchain');
    const thirdParty = group.filter((o) => o.source !== 'onchain');

    const state = resolveState(onchain);
    const expectation = expectationFor(registryEntry, capability, now);

    // A capability we actually found, which the registry justifies, becomes
    // EXPECTED rather than PRESENT. This is the whole USDC fix, and it happens
    // by table lookup on the exact address, never by inferring a token's type.
    const finalState: SignalState =
      state === 'PRESENT' && expectation ? 'EXPECTED' : state;

    const found = onchain.find((o) => isPositive(o.value));

    signals.push({
      capability,
      state: finalState,
      axis: CAPABILITY_AXIS[capability],
      observations: group,
      reasoning: explain(capability, finalState, found, onchain, expectation),
      ...(expectation ? { expectedBecause: expectation.justification } : {}),
      ...(expectation?.constrainedBy ? { constrainedBy: expectation.constrainedBy } : {}),
    });

    // Compare our reading against each third party's. Disagreement is recorded
    // and surfaced, never silently resolved in either direction.
    for (const other of thirdParty) {
      const oursPositive = onchain.some((o) => isPositive(o.value));
      const theirsPositive = isPositive(other.value);
      if (onchain.length > 0 && oursPositive !== theirsPositive) {
        disagreements.push({
          capability,
          ours: {
            value: found?.value ?? null,
            source: 'onchain',
            ...(found?.patternId ? { patternId: found.patternId } : {}),
          },
          theirs: { value: other.value, source: other.source },
          note:
            `Our on-chain reading and ${other.source} disagree on ${capability}. ` +
            `Neither is assumed correct. Treat this token as unresolved on this capability.`,
        });
      }
    }
  }

  // Stable order, so the same inputs always serialise identically.
  const order = new Map(capabilitySchema.options.map((c, i) => [c, i]));
  signals.sort((a, b) => (order.get(a.capability) ?? 0) - (order.get(b.capability) ?? 0));

  return { signals, disagreements };
}

/**
 * One capability, several patterns.
 *
 * Any pattern finding the capability wins, because patterns are independent
 * probes for the same thing and a hit is stronger evidence than a miss. If none
 * hit but at least one definitely looked, it is ABSENT. If nothing could look,
 * it is UNKNOWN.
 */
function resolveState(onchain: Observation[]): SignalState {
  if (onchain.length === 0) return 'UNKNOWN';
  if (onchain.some((o) => isPositive(o.value))) return 'PRESENT';
  // `undefined` is the only value meaning "we could not look". Anything else,
  // including `false` and `null`, means a pattern ran and found nothing.
  if (onchain.some((o) => o.value !== undefined)) return 'ABSENT';
  return 'UNKNOWN';
}

/**
 * Whether a reading actually located something.
 *
 * Exported because more than one place has to agree on it. '0x' and '' are
 * empty return data, not a finding, and a second hand-rolled version of this
 * check that forgot them would quietly count "the call returned nothing" as
 * "the capability is there".
 */
export function isPositive(value: Observation['value']): boolean {
  if (value === null || value === undefined) return false;
  if (value === false) return false;
  if (value === '' || value === '0x') return false;
  return true;
}

function explain(
  capability: Capability,
  state: SignalState,
  found: Observation | undefined,
  onchain: Observation[],
  expectation: { justification: string; constrainedBy?: string } | null
): string {
  const label = capability.replace(/-/g, ' ');

  switch (state) {
    case 'EXPECTED':
      return (
        `${cap(label)} is present (${describe(found)}), and the registry records it as expected for this token. ` +
        `${expectation?.justification ?? ''}` +
        (expectation?.constrainedBy ? ` Constrained by: ${expectation.constrainedBy}.` : '') +
        ` An expected capability is still a capability: the holder can use it.`
      );

    case 'PRESENT':
      return `${cap(label)} is present (${describe(found)}). No registry entry justifies it for this token.`;

    case 'ABSENT': {
      // A structural absence recorded without a pattern carries its own reason.
      const structural = onchain.length === 1 && !onchain[0]!.patternId && onchain[0]!.method;
      if (structural) return `${cap(label)} cannot be present: ${onchain[0]!.method}.`;
      const checked = onchain.filter((o) => o.value !== undefined).length;
      return `${cap(label)} was not found. Checked ${checked} pattern${checked === 1 ? '' : 's'} and none located it.`;
    }

    case 'UNKNOWN':
    default: {
      // No pattern at all is a dictionary gap, and the reader should be told
      // that rather than a generic "could not determine".
      const noPattern = onchain.length > 0 && onchain.every((o) => !o.patternId);
      if (noPattern) {
        return (
          `No pattern in the dictionary reads ${label} on this chain yet. This is not evidence of absence. ` +
          `It counts against coverage so the gap stays visible.`
        );
      }
      return (
        `${cap(label)} could not be determined. This is not evidence of absence. ` +
        `It reduces the coverage figure so the gap stays visible.`
      );
    }
  }
}

function describe(obs: Observation | undefined): string {
  if (!obs) return 'source unclear';
  const via = obs.patternId ? `via ${obs.patternId}` : `via ${obs.source}`;
  const raw = String(obs.value);
  // Addresses get truncated. Descriptive values are already short and readable,
  // so truncating them mid-word produced things like "present (r...".
  const looksLikeAddress = /^(0x[0-9a-fA-F]{6,}|[1-9A-HJ-NP-Za-km-z]{32,})$/.test(raw);
  return looksLikeAddress && raw.length > 20 ? `${raw.slice(0, 10)}..., ${via}` : `${raw}, ${via}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
