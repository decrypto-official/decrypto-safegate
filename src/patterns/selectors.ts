/**
 * Finding capabilities the dictionary cannot read.
 *
 * LIMITATIONS.md §5 names this as the failure mode this project considers most
 * likely: "a token using an admin pattern we have never seen will under-report
 * its capabilities, and we will not know it happened." Until now that gap was
 * completely invisible. No pattern matched, so nothing was emitted, and the
 * token read as clean — the tool's own version of treating absence as safety.
 *
 * A contract's runtime bytecode contains the 4-byte selector of every function
 * it dispatches. So we can ask a question the dictionary cannot: does this
 * contract answer to a privileged function that no pattern of ours reads? That
 * does not tell us the capability is live — only reading it does — but it does
 * tell us our answer is incomplete, which is the part currently missing.
 *
 * Selectors are derived from signatures via keccak256 rather than hand-copied
 * as hex. A wrong constant here would produce a table matching nothing, and the
 * report would be quietly useless instead of visibly broken.
 *
 * This module reports. It does not score. See the note in pipeline.ts.
 */

import type { Capability, DictionaryGap, Observation } from '../types.js';
import { selectorOf } from '../sources/keccak.js';
import type { Pattern } from './resolve.js';
import { isPositive } from '../signals/normalise.js';

interface PrivilegedFunction {
  signature: string;
  capability: Capability;
  /** What holding this function would mean, in the reader's terms. */
  implies: string;
}

/**
 * Privileged functions worth noticing, by the capability each would imply.
 *
 * Every entry is a function that lets someone change the token's behaviour or
 * somebody's balance. Deliberately excluded: anything a holder can call on
 * their own funds (`transfer`, `approve`, `burn` of one's own balance), which
 * is normal ERC-20 surface and not a capability held over anyone.
 *
 * A signature must be canonical for its selector to be right: no argument
 * names, no spaces, and no aliases, so `uint256` never `uint`.
 */
const PRIVILEGED_FUNCTIONS: PrivilegedFunction[] = [
  // Upgradeability. Whoever holds these can replace the contract's logic.
  { signature: 'upgradeTo(address)', capability: 'upgradeability', implies: 'the contract logic can be replaced' },
  { signature: 'upgradeToAndCall(address,bytes)', capability: 'upgradeability', implies: 'the contract logic can be replaced and called in one step' },
  { signature: 'setImplementation(address)', capability: 'upgradeability', implies: 'the implementation address can be repointed' },
  { signature: 'changeAdmin(address)', capability: 'upgradeability', implies: 'the proxy admin can be handed to someone else' },

  // Administrative control.
  { signature: 'transferOwnership(address)', capability: 'admin-authority', implies: 'ownership can be handed to another address' },
  { signature: 'setOwner(address)', capability: 'admin-authority', implies: 'the owner can be set directly' },
  { signature: 'grantRole(bytes32,address)', capability: 'admin-authority', implies: 'privileged roles can be granted' },
  { signature: 'setAdmin(address)', capability: 'admin-authority', implies: 'the admin can be set directly' },

  // Supply.
  { signature: 'mint(address,uint256)', capability: 'mint-authority', implies: 'new supply can be created' },
  { signature: 'setMinter(address)', capability: 'mint-authority', implies: 'the minting authority can be reassigned' },
  { signature: 'addMinter(address)', capability: 'mint-authority', implies: 'additional minters can be appointed' },
  { signature: 'burnFrom(address,uint256)', capability: 'mint-authority', implies: 'balances can be destroyed from another address' },

  // Freezing a specific holder.
  { signature: 'freeze(address)', capability: 'freeze-authority', implies: 'an individual holder can be frozen' },
  { signature: 'freezeAccount(address,bool)', capability: 'freeze-authority', implies: 'an individual account can be frozen' },

  // Restricting transfer, for everyone or for one holder.
  { signature: 'pause()', capability: 'transfer-restriction', implies: 'all transfers can be halted' },
  { signature: 'blacklist(address)', capability: 'transfer-restriction', implies: 'an address can be blocked from transacting' },
  { signature: 'addBlackList(address)', capability: 'transfer-restriction', implies: 'an address can be added to a block list' },
  { signature: 'blockAccount(address)', capability: 'transfer-restriction', implies: 'an account can be blocked' },

  // Economics.
  { signature: 'setFee(uint256)', capability: 'fee-control', implies: 'a transfer fee can be changed' },
  { signature: 'setFeeRate(uint256)', capability: 'fee-control', implies: 'the fee rate can be changed' },
  { signature: 'setTaxRate(uint256)', capability: 'fee-control', implies: 'the tax rate can be changed' },

  // Metadata. Rarer on a plain ERC-20 than on an NFT, but a mutable URI is how
  // a token's public identity gets rewritten after people have looked at it.
  { signature: 'setBaseURI(string)', capability: 'metadata-mutability', implies: 'token metadata can be repointed' },
  { signature: 'setTokenURI(uint256,string)', capability: 'metadata-mutability', implies: 'the metadata of a specific token can be rewritten' },
  { signature: 'setContractURI(string)', capability: 'metadata-mutability', implies: 'contract-level metadata can be rewritten' },
];

/**
 * Capabilities with no EVM function surface worth scanning for.
 *
 * Declared rather than left implicit. Every capability must appear either in
 * the table above or in this set, and a test enforces that — otherwise a new
 * capability silently becomes undetectable, which is the same invisible-gap
 * problem this module exists to solve, one level up.
 *
 * `freeze-authority` stays in the table despite being a Solana concept,
 * because the EVM equivalents (freeze, freezeAccount) do exist on some tokens.
 */
const NOT_APPLICABLE_ON_EVM: ReadonlySet<Capability> = new Set<Capability>();

/** Exposed so the completeness test can assert against it rather than duplicate it. */
export function capabilitiesNotScannedOnEvm(): ReadonlySet<Capability> {
  return NOT_APPLICABLE_ON_EVM;
}

/** The capabilities the table can actually produce a gap for. Exposed for tests. */
export function scannedCapabilities(): Set<Capability> {
  return new Set(PRIVILEGED_FUNCTIONS.map((fn) => fn.capability));
}

/** Every signature in the table, so a test can check they are canonical. */
export function privilegedSignatures(): string[] {
  return PRIVILEGED_FUNCTIONS.map((fn) => fn.signature);
}

/** Selector -> definition. Built once, from keccak rather than from constants. */
const BY_SELECTOR: Map<string, PrivilegedFunction> = new Map(
  PRIVILEGED_FUNCTIONS.map((fn) => [selectorOf(fn.signature), fn])
);

/**
 * Every 4-byte selector a contract's bytecode pushes.
 *
 * Walks opcodes rather than pattern-matching the hex. A PUSH instruction is
 * followed by its literal operand, and those bytes must be skipped: scanning
 * for the byte 0x63 without tracking PUSH boundaries would read operand data
 * as instructions and invent selectors that are not there.
 */
export function extractSelectors(bytecode: string): Set<string> {
  const hex = bytecode.replace(/^0x/, '').toLowerCase();
  const out = new Set<string>();
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) return out;

  const length = hex.length / 2;
  let i = 0;

  while (i < length) {
    const op = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

    // PUSH1 (0x60) through PUSH32 (0x7f) carry an inline operand.
    if (op >= 0x60 && op <= 0x7f) {
      const operandBytes = op - 0x5f;
      // PUSH4 is how a dispatcher loads a function selector.
      if (op === 0x63 && i + 1 + 4 <= length) {
        out.add('0x' + hex.slice((i + 1) * 2, (i + 5) * 2));
      }
      i += 1 + operandBytes;
      continue;
    }

    i += 1;
  }

  return out;
}

/**
 * Privileged functions in the bytecode that our reading did not account for.
 *
 * Two subtractions keep this quiet enough to be worth reading:
 *
 *  1. Any selector a pattern already calls. The dictionary reads it, so it is
 *     not a gap even if that particular call found nothing.
 *  2. Any capability we already found positively by some other route. If
 *     `owner()` located an admin, `transferOwnership` appearing as well says
 *     nothing new — the capability is already reported and scored.
 *
 * What survives is the case that matters: the contract answers to something
 * privileged, and we have no reading of that capability at all.
 */
export function findDictionaryGaps(
  bytecode: string,
  patterns: Pattern[],
  observations: Observation[]
): DictionaryGap[] {
  const present = extractSelectors(bytecode);
  if (present.size === 0) return [];

  const readByAPattern = new Set(
    patterns
      .map((p) => p.method.callSelector?.toLowerCase())
      .filter((s): s is string => typeof s === 'string')
  );

  // isPositive rather than a local truthiness check: it also rules out '' and
  // '0x', which are empty return data and not a finding. A second definition of
  // "we found something" would drift from the one the scorer uses.
  const alreadyFound = new Set(
    observations.filter((o) => isPositive(o.value)).map((o) => o.capability)
  );

  const gaps: DictionaryGap[] = [];

  for (const selector of present) {
    const fn = BY_SELECTOR.get(selector);
    if (!fn) continue;
    if (readByAPattern.has(selector)) continue;
    if (alreadyFound.has(fn.capability)) continue;

    gaps.push({
      selector,
      signature: fn.signature,
      capability: fn.capability,
      note:
        `The contract exposes ${fn.signature}, so ${fn.implies}. No pattern in the ` +
        `dictionary reads this, and nothing else resolved ${fn.capability} for this token, ` +
        `so the capability is unaccounted for rather than absent.`,
    });
  }

  // Stable order, so the same contract always produces the same score bytes.
  return gaps.sort((a, b) => a.selector.localeCompare(b.selector));
}
