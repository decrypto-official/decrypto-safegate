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

export interface PrivilegedFunction {
  signature: string;
  capability: Capability;
  /** What holding this function would mean, in the reader's terms. */
  implies: string;
  /**
   * A pattern whose getter, answering a definite nothing, explains this write
   * function away. owner() answering the zero address is a renounced Ownable,
   * and transferOwnership can never pass its check again, so listing it as an
   * unread power would be noise. Only set where the getter and the setter are
   * two halves of one mechanism.
   */
  explainedBy?: string;
}

/** The pattern that reads Ownable's owner(). Its zero answer is a renouncement the scan reasons from. */
const OWNERSHIP_GETTER = 'admin-ownable';

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
  { signature: 'transferOwnership(address)', capability: 'admin-authority', implies: 'ownership can be handed to another address', explainedBy: OWNERSHIP_GETTER },
  { signature: 'setOwner(address)', capability: 'admin-authority', implies: 'the owner can be set directly', explainedBy: OWNERSHIP_GETTER },
  { signature: 'grantRole(bytes32,address)', capability: 'admin-authority', implies: 'privileged roles can be granted' },
  { signature: 'setAdmin(address)', capability: 'admin-authority', implies: 'the admin can be set directly' },

  // Supply.
  { signature: 'mint(address,uint256)', capability: 'mint-authority', implies: 'new supply can be created' },
  { signature: 'setMinter(address)', capability: 'mint-authority', implies: 'the minting authority can be reassigned' },
  { signature: 'addMinter(address)', capability: 'mint-authority', implies: 'additional minters can be appointed' },
  { signature: 'mint(uint256)', capability: 'mint-authority', implies: 'new supply can be created' },
  // burnFrom(address,uint256) left this table in 0.5.0. OpenZeppelin's spends
  // the caller's allowance, so anyone can call it on funds approved to them:
  // ordinary ERC-20 surface, not a power held over anyone. On a sample of 40
  // launch-week tokens it was the second largest source of false gaps.

  // Freezing a specific holder.
  { signature: 'freeze(address)', capability: 'freeze-authority', implies: 'an individual holder can be frozen' },
  { signature: 'freezeAccount(address,bool)', capability: 'freeze-authority', implies: 'an individual account can be frozen' },
  // The launchpad template's spellings, from the 2026-09 sample.
  { signature: 'setBlacklisted(address,bool)', capability: 'freeze-authority', implies: 'an address can be blocked from transacting' },
  { signature: 'blacklistAddress(address,bool)', capability: 'freeze-authority', implies: 'an address can be blocked from transacting' },
  { signature: 'setBlacklist(address,bool)', capability: 'freeze-authority', implies: 'an address can be blocked from transacting' },
  { signature: 'setBots(address[],bool)', capability: 'freeze-authority', implies: 'addresses can be marked as bots and blocked' },
  { signature: 'addBots(address[])', capability: 'freeze-authority', implies: 'addresses can be marked as bots and blocked' },

  // Blocking one holder is freeze authority, the same capability a Solana
  // freeze authority holds. Since 0.2.0 the dictionary reads it through the
  // isBlacklisted getters, and the write functions stay here so a contract
  // with a blacklist and no readable getter is still reported.
  { signature: 'blacklist(address)', capability: 'freeze-authority', implies: 'an address can be blocked from transacting' },
  { signature: 'addBlackList(address)', capability: 'freeze-authority', implies: 'an address can be added to a block list' },
  { signature: 'blockAccount(address)', capability: 'freeze-authority', implies: 'an account can be blocked' },

  // Restricting transfer for everyone.
  { signature: 'pause()', capability: 'transfer-restriction', implies: 'all transfers can be halted' },
  // Trading gates and per-wallet limits, the launchpad template's shape of
  // the same power: until trading is enabled nobody can sell, and a limit
  // caps what anyone can move.
  { signature: 'enableTrading()', capability: 'transfer-restriction', implies: 'trading is gated and can be switched on or left off' },
  { signature: 'openTrading()', capability: 'transfer-restriction', implies: 'trading is gated and can be switched on or left off' },
  { signature: 'setTradingEnabled(bool)', capability: 'transfer-restriction', implies: 'trading can be switched on and off' },
  { signature: 'removeLimits()', capability: 'transfer-restriction', implies: 'per-transaction and per-wallet limits exist and can be lifted' },
  { signature: 'updateMaxTxnAmount(uint256)', capability: 'transfer-restriction', implies: 'the per-transaction limit can be changed' },
  { signature: 'updateMaxWalletAmount(uint256)', capability: 'transfer-restriction', implies: 'the per-wallet limit can be changed' },
  { signature: 'setMaxTxAmount(uint256)', capability: 'transfer-restriction', implies: 'the per-transaction limit can be changed' },
  { signature: 'setMaxWallet(uint256)', capability: 'transfer-restriction', implies: 'the per-wallet limit can be changed' },

  // Economics. setParams is Tether's: since 0.3.0 the dictionary reads its
  // getter, and the write function stays here for a contract that carries
  // the switch under a getter we do not read.
  { signature: 'setParams(uint256,uint256)', capability: 'fee-control', implies: 'a transfer fee and its cap can be set' },
  { signature: 'setFee(uint256)', capability: 'fee-control', implies: 'a transfer fee can be changed' },
  { signature: 'setFeeRate(uint256)', capability: 'fee-control', implies: 'the fee rate can be changed' },
  { signature: 'setTaxRate(uint256)', capability: 'fee-control', implies: 'the tax rate can be changed' },
  // The launchpad template's fee setters, from the 2026-09 sample.
  { signature: 'updateBuyFees(uint256,uint256,uint256)', capability: 'fee-control', implies: 'the buy fee can be changed' },
  { signature: 'updateSellFees(uint256,uint256,uint256)', capability: 'fee-control', implies: 'the sell fee can be changed' },
  { signature: 'setFees(uint256,uint256)', capability: 'fee-control', implies: 'the buy and sell fees can be changed' },
  { signature: 'updateFees(uint256,uint256)', capability: 'fee-control', implies: 'the buy and sell fees can be changed' },
  { signature: 'setBuyTax(uint256)', capability: 'fee-control', implies: 'the buy tax can be changed' },
  { signature: 'setSellTax(uint256)', capability: 'fee-control', implies: 'the sell tax can be changed' },
  { signature: 'setTaxes(uint256,uint256)', capability: 'fee-control', implies: 'the taxes can be changed' },
  { signature: 'excludeFromFees(address,bool)', capability: 'fee-control', implies: 'chosen addresses can be exempted from the fee' },
  { signature: 'excludeFromFee(address)', capability: 'fee-control', implies: 'chosen addresses can be exempted from the fee' },
  { signature: 'updateMarketingWallet(address)', capability: 'fee-control', implies: 'where the fee is sent can be changed' },
  { signature: 'setMarketingWallet(address)', capability: 'fee-control', implies: 'where the fee is sent can be changed' },
  { signature: 'setTaxWallet(address)', capability: 'fee-control', implies: 'where the fee is sent can be changed' },

  // Metadata. Rarer on a plain ERC-20 than on an NFT, but a mutable URI is how
  // a token's public identity gets rewritten after people have looked at it.
  //
  // This block carries a second job since 0.6.0: it is the set that decides
  // whether metadata mutability can be read ABSENT on a contract whose
  // bytecode is fixed. See METADATA_MUTATORS below. A spelling missing from
  // here is not only an unreported gap, it is a false clean reading, so the
  // bar for leaving one out is higher than for the other capabilities.
  { signature: 'setBaseURI(string)', capability: 'metadata-mutability', implies: 'token metadata can be repointed' },
  { signature: 'setTokenURI(uint256,string)', capability: 'metadata-mutability', implies: 'the metadata of a specific token can be rewritten' },
  { signature: 'setContractURI(string)', capability: 'metadata-mutability', implies: 'contract-level metadata can be rewritten' },
  // The ERC-20 spellings. None appeared on the 52 tokens scanned for 0.6.0 and
  // all four were added on the argument that an absence must be an absence of
  // something named. The 400-token sweep for 0.7.0 found them on 11 tokens, so
  // the speculative additions were the ones doing the work.
  { signature: 'setName(string)', capability: 'metadata-mutability', implies: 'the token name can be rewritten' },
  { signature: 'setSymbol(string)', capability: 'metadata-mutability', implies: 'the token symbol can be rewritten' },
  { signature: 'setNameAndSymbol(string,string)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten' },
  { signature: 'setTokenInformation(string,string)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten' },
  // Found by that sweep, each on a live mainnet token, and each one a token
  // that read as a verified clean absence until it was listed here. These are
  // why the list is measured rather than reasoned about: every one is an
  // ordinary spelling that simply nobody had written down.
  { signature: 'setTokenURI(string)', capability: 'metadata-mutability', implies: 'the token-level metadata URI can be repointed' },
  { signature: 'setNameSymbol(string,string)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten' },
  { signature: 'changeNameAndSymbol(string,string)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten' },
  // The write half of the derived-balance mechanism meta-scaled-balance reads.
  // Two arities: the sweep found the one-argument form on a live token.
  { signature: 'rebase(uint256,int256)', capability: 'metadata-mutability', implies: 'every holder’s displayed balance can be rescaled in one call' },
  { signature: 'rebase(uint256)', capability: 'metadata-mutability', implies: 'every holder’s displayed balance can be rescaled in one call' },

  // Everything below was a guess, and is here because guessing wide is the
  // cheaper mistake. `npm run sweep` watches for spellings the table does not
  // have; two independent 400-token samples each surfaced new ones, so the list
  // was not converging by being added to four at a time. A signature here that
  // no contract ever dispatches costs a line of code. One that is missing while
  // a real contract dispatches it costs a published "cannot be present" on a
  // token whose name can in fact be rewritten, which is the failure this whole
  // table exists to prevent. Entries are kept to names that unambiguously mean
  // metadata: a generic numeric setter could be anything, so those stay on the
  // sweep's watchlist rather than being adopted here on a guess.
  { signature: 'updateName(string)', capability: 'metadata-mutability', implies: 'the token name can be rewritten' },
  { signature: 'updateSymbol(string)', capability: 'metadata-mutability', implies: 'the token symbol can be rewritten' },
  { signature: 'changeName(string)', capability: 'metadata-mutability', implies: 'the token name can be rewritten' },
  { signature: 'changeSymbol(string)', capability: 'metadata-mutability', implies: 'the token symbol can be rewritten' },
  { signature: 'setTokenName(string)', capability: 'metadata-mutability', implies: 'the token name can be rewritten' },
  { signature: 'setTokenSymbol(string)', capability: 'metadata-mutability', implies: 'the token symbol can be rewritten' },
  { signature: 'updateTokenName(string)', capability: 'metadata-mutability', implies: 'the token name can be rewritten' },
  { signature: 'updateTokenSymbol(string)', capability: 'metadata-mutability', implies: 'the token symbol can be rewritten' },
  { signature: 'setNewName(string)', capability: 'metadata-mutability', implies: 'the token name can be rewritten' },
  { signature: 'setNewSymbol(string)', capability: 'metadata-mutability', implies: 'the token symbol can be rewritten' },
  { signature: 'editName(string)', capability: 'metadata-mutability', implies: 'the token name can be rewritten' },
  { signature: 'editSymbol(string)', capability: 'metadata-mutability', implies: 'the token symbol can be rewritten' },
  { signature: 'setTicker(string)', capability: 'metadata-mutability', implies: 'the token ticker can be rewritten' },
  { signature: 'updateTicker(string)', capability: 'metadata-mutability', implies: 'the token ticker can be rewritten' },
  { signature: 'rename(string,string)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten' },
  { signature: 'updateNameAndSymbol(string,string)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten' },
  { signature: 'setTokenNameAndSymbol(string,string)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten' },
  { signature: 'setNameAndTicker(string,string)', capability: 'metadata-mutability', implies: 'the token name and ticker can be rewritten' },
  { signature: 'updateTokenInfo(string,string)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten' },
  { signature: 'setMetadata(string,string)', capability: 'metadata-mutability', implies: 'the token metadata can be rewritten' },
  { signature: 'setInfo(string,string)', capability: 'metadata-mutability', implies: 'the token metadata can be rewritten' },
  { signature: 'setDetails(string,string)', capability: 'metadata-mutability', implies: 'the token metadata can be rewritten' },
  { signature: 'setName(bytes32)', capability: 'metadata-mutability', implies: 'the token name can be rewritten, in the bytes32 style older tokens use' },
  { signature: 'setSymbol(bytes32)', capability: 'metadata-mutability', implies: 'the token symbol can be rewritten, in the bytes32 style older tokens use' },
  { signature: 'setNameAndSymbol(bytes32,bytes32)', capability: 'metadata-mutability', implies: 'the token name and symbol can be rewritten, in the bytes32 style' },
  { signature: 'setURI(string)', capability: 'metadata-mutability', implies: 'the metadata URI can be repointed' },
  { signature: 'setBaseUri(string)', capability: 'metadata-mutability', implies: 'the metadata base URI can be repointed' },
  { signature: 'setBaseTokenURI(string)', capability: 'metadata-mutability', implies: 'the metadata base URI can be repointed' },
  { signature: 'updateBaseURI(string)', capability: 'metadata-mutability', implies: 'the metadata base URI can be repointed' },
  { signature: 'updateTokenURI(string)', capability: 'metadata-mutability', implies: 'the token metadata URI can be repointed' },
  { signature: 'setContractUri(string)', capability: 'metadata-mutability', implies: 'contract-level metadata can be rewritten' },
  { signature: 'setMetadataURI(string)', capability: 'metadata-mutability', implies: 'the metadata URI can be repointed' },
  { signature: 'updateMetadata(string)', capability: 'metadata-mutability', implies: 'the token metadata can be rewritten' },
  { signature: 'setMetadataAddress(address)', capability: 'metadata-mutability', implies: 'the account metadata is read from can be repointed' },
  { signature: 'setMetadataContract(address)', capability: 'metadata-mutability', implies: 'the contract metadata is read from can be repointed' },
  { signature: 'setDescription(string)', capability: 'metadata-mutability', implies: 'the token description can be rewritten' },
  { signature: 'setLogo(string)', capability: 'metadata-mutability', implies: 'the token logo can be repointed' },
  { signature: 'setImage(string)', capability: 'metadata-mutability', implies: 'the token image can be repointed' },
  { signature: 'rebase()', capability: 'metadata-mutability', implies: 'every holder’s displayed balance can be rescaled in one call' },
  { signature: 'setScalingFactor(uint256)', capability: 'metadata-mutability', implies: 'the factor every displayed balance is scaled by can be set' },
  { signature: 'setRebaseFactor(uint256)', capability: 'metadata-mutability', implies: 'the factor every displayed balance is scaled by can be set' },
  { signature: 'setSharesPerToken(uint256)', capability: 'metadata-mutability', implies: 'the ratio every displayed balance is derived from can be set' },
];

/**
 * The selectors whose absence lets metadata mutability be read ABSENT.
 *
 * Derived from the table above rather than listed again, so the set that
 * reports a gap and the set that licenses an absence can never drift apart.
 * Adding a metadata spelling to PRIVILEGED_FUNCTIONS tightens both at once;
 * forgetting one loosens both, which is the honest coupling.
 */
const METADATA_MUTATORS: readonly string[] = PRIVILEGED_FUNCTIONS.filter(
  (fn) => fn.capability === 'metadata-mutability'
).map((fn) => fn.signature);

/**
 * Capability -> the selectors this table holds for it. Built once from keccak
 * at module load, like BY_SELECTOR, rather than hashing the table again on
 * every call.
 */
const SELECTORS_BY_CAPABILITY: Map<Capability, Set<string>> = PRIVILEGED_FUNCTIONS.reduce(
  (acc, fn) => acc.set(fn.capability, (acc.get(fn.capability) ?? new Set()).add(selectorOf(fn.signature))),
  new Map<Capability, Set<string>>()
);

/** Does this surface dispatch any table function for the given capability? */
function dispatchesAnyFor(selectors: ReadonlySet<string>, capability: Capability): boolean {
  const wanted = SELECTORS_BY_CAPABILITY.get(capability);
  if (!wanted) return false;
  for (const selector of wanted) if (selectors.has(selector)) return true;
  return false;
}

/**
 * Does this contract dispatch any function that could rewrite its metadata?
 *
 * `true` means one is dispatched and the capability is live surface. `false`
 * means none of the spellings we know is there — which licenses an ABSENT
 * reading only when the bytecode is also fixed, because a contract that can be
 * upgraded can grow one tomorrow. The caller owns that second condition.
 */
export function dispatchesMetadataMutator(selectors: ReadonlySet<string>): boolean {
  return dispatchesAnyFor(selectors, 'metadata-mutability');
}

/**
 * Does this contract dispatch a function that can replace the code that runs?
 *
 * Used to decide whether bytecode counts as fixed. Deliberately independent of
 * the proxy-slot patterns: a contract can carry `upgradeTo` without any slot
 * this dictionary reads, and treating that as fixed would license an absence
 * on a contract that can grow the very function the absence denies.
 */
export function dispatchesUpgradeFunction(selectors: ReadonlySet<string>): boolean {
  return dispatchesAnyFor(selectors, 'upgradeability');
}

/** The metadata spellings the absence reading is an absence of, for docs and tests. */
export function metadataMutatorSignatures(): readonly string[] {
  return METADATA_MUTATORS;
}

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

/**
 * The table and its declared exclusions, for the completeness tests.
 *
 * One accessor rather than several narrow ones: a test that derives what it
 * needs from the real table cannot fall out of step with it, whereas a helper
 * per question is more surface to keep in sync for no extra safety.
 */
export function privilegedFunctionTable(): {
  functions: readonly PrivilegedFunction[];
  notScannedOnEvm: ReadonlySet<Capability>;
} {
  return { functions: PRIVILEGED_FUNCTIONS, notScannedOnEvm: NOT_APPLICABLE_ON_EVM };
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

/** Bytecode of a contract the token delegates to, and where it was read from. */
export interface ImplementationCode {
  address: string;
  bytecode: string;
}

/**
 * Addresses whose code runs behind this token, from the patterns that declare
 * their slot holds one (`method.pointsTo: implementation`).
 *
 * A proxy's own bytecode dispatches upgradeTo and little else; every
 * privileged function lives in the implementation. A scan that stops at the
 * proxy therefore reports nothing for exactly the tokens most worth scanning,
 * and before 0.3.0 it did. A beacon slot holds the beacon, not the code, and
 * is not followed.
 */
export function implementationAddresses(patterns: Pattern[], observations: Observation[]): string[] {
  const pointing = new Set(patterns.filter((p) => p.method.pointsTo === 'implementation').map((p) => p.id));
  const out: string[] = [];
  for (const o of observations) {
    if (!o.patternId || !pointing.has(o.patternId)) continue;
    if (typeof o.value !== 'string' || !/^0x[0-9a-f]{40}$/i.test(o.value)) continue;
    const address = o.value.toLowerCase();
    if (!out.includes(address)) out.push(address);
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
  observations: Observation[],
  implementations: ImplementationCode[] = []
): DictionaryGap[] {
  // Selector -> the implementation it was found on, or null for the
  // contract's own bytecode. The contract's own entry wins when both carry it,
  // so a selector is reported once and the note names where it sits.
  const present = new Map<string, string | null>();
  for (const impl of implementations) {
    for (const selector of extractSelectors(impl.bytecode)) present.set(selector, impl.address);
  }
  for (const selector of extractSelectors(bytecode)) present.set(selector, null);
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

  // Getters that answered a definite nothing. They explain their own setter
  // away, and one of them, owner(), tells the reader something about every
  // other function on the list: an owner-gated setter on a renounced token
  // can never be called again, and the modifier cannot be read from bytecode.
  const answeredNothing = new Set(
    observations
      .filter((o) => o.read === 'answered' && o.value === null && typeof o.patternId === 'string')
      .map((o) => o.patternId as string)
  );
  // Only when no admin mechanism was found at all. MKR's Ownable owner is zero
  // while its DSAuth authority is live and can mint; calling that "renounced"
  // would reassure a reader about the one token it should not.
  const renounced = answeredNothing.has(OWNERSHIP_GETTER) && !alreadyFound.has('admin-authority');

  const gaps: DictionaryGap[] = [];

  for (const [selector, foundOn] of present) {
    const fn = BY_SELECTOR.get(selector);
    if (!fn) continue;
    if (readByAPattern.has(selector)) continue;
    if (alreadyFound.has(fn.capability)) continue;
    if (fn.explainedBy && answeredNothing.has(fn.explainedBy)) continue;

    const where = foundOn
      ? `The implementation at ${foundOn}, which this contract delegates to, exposes`
      : 'The contract exposes';

    gaps.push({
      surface: 'evm-selector',
      selector,
      signature: fn.signature,
      capability: fn.capability,
      note:
        `${where} ${fn.signature}, so ${fn.implies}. No pattern in the ` +
        `dictionary reads this, and nothing else resolved ${fn.capability} for this token, ` +
        `so the capability is unaccounted for rather than absent.` +
        (renounced
          ? ` Ownership is renounced (owner() answered the zero address), so if this function is ` +
            `owner-gated it can no longer be called; the modifier cannot be read from bytecode.`
          : ''),
    });
  }

  // Stable order, so the same contract always produces the same score bytes.
  return gaps.sort((a, b) => a.selector.localeCompare(b.selector));
}
