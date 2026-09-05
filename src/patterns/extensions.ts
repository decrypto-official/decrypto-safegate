/**
 * Finding Token-2022 capabilities the dictionary cannot read.
 *
 * The Solana counterpart of selectors.ts, and the closer of the two to a real
 * measurement.
 *
 * On EVM the surface is runtime bytecode: a 4-byte selector proves the contract
 * can dispatch that function, which tells us our answer is incomplete without
 * telling us the capability is live. On Solana the surface is the mint's
 * extension list, and that list is not a set of things the mint could do — it
 * is the set of things it is configured to do, right now, each with its
 * authority named in the account. An extension nobody reads is therefore a
 * stronger finding than an unread selector: not "we may be missing something"
 * but "this power is switched on and we did not report it".
 *
 * The legacy Token program has no extension list. That is not a blind spot: a
 * legacy mint's entire privileged surface is `mintAuthority` and
 * `freezeAuthority`, both of which the dictionary reads, so the scan genuinely
 * runs on those mints and genuinely finds nothing. Reporting that as
 * `not-applicable` understated what we know.
 *
 * This module reports. It does not score. See the note in pipeline.ts.
 */

import type { Capability, DictionaryGap, Observation } from '../types.js';
import type { Pattern } from './resolve.js';
import { isPositive } from '../signals/normalise.js';

export interface MintExtension {
  /** The `extension` string exactly as the RPC returns it. Case-sensitive. */
  extension: string;
  capability: Capability;
  /** What the holder of this extension's authority can do, in the reader's terms. */
  implies: string;
}

/**
 * Mint-level Token-2022 extensions that confer a power over a holder.
 *
 * Deliberately excluded: token-account-level extensions, which describe one
 * holder's own account rather than a power held over everyone
 * (`immutableOwner`, `memoTransfer`, `cpiGuard`, `transferFeeAmount`,
 * `confidentialTransferAccount`), and mint-level extensions that record a fact
 * without granting anyone anything (`tokenGroup`, `tokenGroupMember`).
 *
 * `nonTransferable` is here even though it has no authority at all: it is a
 * standing restriction on every holder, which is a capability the token holds
 * over you whether or not anybody has to act to exercise it.
 */
const MINT_EXTENSIONS: MintExtension[] = [
  {
    extension: 'permanentDelegate',
    capability: 'transfer-restriction',
    implies: 'one address can transfer or burn any holder\u2019s balance at any time, with no action or consent from that holder',
  },
  {
    extension: 'transferHook',
    capability: 'transfer-restriction',
    implies: 'an arbitrary program can be installed to run on every transfer and reject it, with no delay before it takes effect',
  },
  {
    extension: 'pausableConfig',
    capability: 'transfer-restriction',
    implies: 'transferring, minting and burning this token can all be halted globally',
  },
  {
    extension: 'permissionedBurnConfig',
    capability: 'transfer-restriction',
    implies: 'burning requires a designated signer, so an exit path is gated',
  },
  {
    extension: 'nonTransferable',
    capability: 'transfer-restriction',
    implies: 'the token cannot be transferred at all once held',
  },
  {
    extension: 'defaultAccountState',
    capability: 'freeze-authority',
    implies: 'newly created holder accounts can be born frozen, so receiving the token does not mean being able to move it',
  },
  {
    extension: 'mintCloseAuthority',
    capability: 'upgradeability',
    implies: 'the mint can be closed once supply reaches zero and the same address re-initialised as a different token, with different rules',
  },
  {
    extension: 'confidentialTransferMint',
    capability: 'admin-authority',
    implies: 'an authority governs confidential transfers, gates which accounts may use them, and configures the key that can decrypt their amounts',
  },
  {
    extension: 'confidentialMintBurn',
    capability: 'mint-authority',
    implies: 'total supply is encrypted, so how much of this token exists cannot be verified by an outside observer',
  },
  {
    extension: 'transferFeeConfig',
    capability: 'fee-control',
    implies: 'a fee is charged on transfers and can be raised as high as 100 per cent, two epochs after the change is made',
  },
  {
    extension: 'confidentialTransferFeeConfig',
    capability: 'fee-control',
    implies: 'fees withheld from confidential transfers can be harvested by an authority',
  },
  {
    extension: 'interestBearingConfig',
    capability: 'fee-control',
    implies: 'an authority sets a rate, which may be negative, that continuously rescales every displayed balance',
  },
  {
    extension: 'scaledUiAmountConfig',
    capability: 'metadata-mutability',
    implies: 'an authority sets a multiplier, possibly future-dated, that changes what every wallet reports a holder owns',
  },
  {
    extension: 'metadataPointer',
    capability: 'metadata-mutability',
    implies: 'the account the token\u2019s name, symbol and image are read from can be repointed',
  },
  {
    extension: 'tokenMetadata',
    capability: 'metadata-mutability',
    implies: 'the token\u2019s name, symbol and URI can be rewritten in place',
  },
  {
    extension: 'groupPointer',
    capability: 'metadata-mutability',
    implies: 'the group configuration this token points at can be repointed',
  },
  {
    extension: 'tokenGroup',
    capability: 'metadata-mutability',
    implies: 'the group this token defines, and its size, can be changed',
  },
  {
    extension: 'groupMemberPointer',
    capability: 'metadata-mutability',
    implies: 'the membership record this token points at can be repointed',
  },
];

/**
 * Extensions deliberately not treated as a capability.
 *
 * Declared rather than left implicit, and enforced by a test, for the same
 * reason selectors.ts declares its exclusions: an extension that is neither
 * mapped nor listed here is reported as unclassified, so silence is never the
 * default. Anything added to this set is a decision someone has to defend.
 *
 * Every token-account-level extension is excluded by construction — this scans
 * a mint — but the three mirrors are named because they can appear in a holder
 * account read and must not be mistaken for mint powers.
 */
const NOT_A_CAPABILITY: ReadonlySet<string> = new Set([
  // Records a fact, grants nobody anything.
  'tokenGroupMember',
  // Holder-side self-protections, not powers held over anyone.
  'immutableOwner',
  'memoTransfer',
  'cpiGuard',
  // Account-level mirrors of mint extensions already covered above.
  'transferFeeAmount',
  'confidentialTransferAccount',
  'confidentialTransferFeeAmount',
  'nonTransferableAccount',
  'transferHookAccount',
  'pausableAccount',
]);

/**
 * The RPC's own marker for an extension it could not decode.
 *
 * Handled separately from an unrecognised name because it means something
 * worse: not "we have never classified this" but "the node could not read it
 * either". Both are reported; only this one says the data itself was
 * unreadable.
 */
const UNPARSEABLE = 'unparseableExtension';

/** The table, for the completeness tests. */
export function mintExtensionTable(): {
  extensions: readonly MintExtension[];
  notACapability: ReadonlySet<string>;
} {
  return { extensions: MINT_EXTENSIONS, notACapability: NOT_A_CAPABILITY };
}

const BY_NAME: Map<string, MintExtension> = new Map(MINT_EXTENSIONS.map((e) => [e.extension, e]));

/**
 * The extension names configured on a mint, in the order the RPC returned them.
 *
 * Returns null when there is no list at all, which the caller must not treat as
 * an empty list: a legacy mint and an unreadable account both produce no array,
 * and only one of them is a fact about the token.
 */
export function extensionNames(mintAccount: Record<string, unknown> | null): string[] | null {
  if (mintAccount === null) return null;
  const info = (mintAccount as { data?: { parsed?: { info?: Record<string, unknown> } } }).data?.parsed?.info;
  const list = info?.extensions;
  if (!Array.isArray(list)) return null;

  return list
    .map((e) => (typeof e === 'object' && e !== null ? (e as { extension?: unknown }).extension : undefined))
    .filter((name): name is string => typeof name === 'string');
}

/**
 * Extensions configured on this mint that our reading did not account for.
 *
 * The same two subtractions as the EVM scan, for the same reasons:
 *
 *  1. Any extension a pattern already reads. The dictionary covers it, even if
 *     that particular read came back null.
 *  2. Any capability already found positively by some other route, so a second
 *     extension mapping to a capability we have already reported says nothing
 *     new.
 *
 * What survives is the case that matters: this mint is configured with a power
 * and we have no reading of that power at all.
 */
export function findExtensionGaps(
  mintAccount: Record<string, unknown> | null,
  patterns: Pattern[],
  observations: Observation[]
): DictionaryGap[] {
  const present = extensionNames(mintAccount);
  if (present === null || present.length === 0) return [];

  const readByAPattern = new Set(
    patterns
      .filter((p) => p.method.kind === 'account-extension')
      .map((p) => p.method.extension)
      .filter((e): e is string => typeof e === 'string')
  );

  const alreadyFound = new Set(
    observations.filter((o) => isPositive(o.value)).map((o) => o.capability)
  );

  const gaps: DictionaryGap[] = [];
  const seen = new Set<string>();

  for (const name of present) {
    if (seen.has(name)) continue;
    seen.add(name);

    if (NOT_A_CAPABILITY.has(name)) continue;

    // The node returned an extension it could not decode. We know something is
    // there and we know nothing about what it does — the loudest possible case
    // of an unread power, and the one most likely to be dropped by a reader
    // that only handles names it recognises.
    if (name === UNPARSEABLE) {
      gaps.push({
        surface: 'solana-extension',
        selector: name,
        signature: name,
        capability: null,
        note:
          `This mint carries an extension the node itself could not decode. Something is configured ` +
          `on it and neither the RPC nor this dictionary can say what. It is unread, not absent, and ` +
          `no capability can be ruled out on the strength of this score.`,
      });
      continue;
    }

    const ext = BY_NAME.get(name);

    // An extension we have never classified. Token-2022 gains extension types
    // regularly, and skipping the ones we do not recognise would mean the
    // newest power on a mint is the one we are guaranteed to miss — this
    // project's own absence-is-never-safety error, one level up.
    if (!ext) {
      gaps.push({
        surface: 'solana-extension',
        selector: name,
        signature: name,
        capability: null,
        note:
          `This mint is configured with the ${name} extension, which this dictionary has never ` +
          `classified. What it permits is unknown to us. Naming a capability for it would be a ` +
          `guess, so none is named; it is unread, not absent.`,
      });
      continue;
    }

    if (readByAPattern.has(name)) continue;
    if (alreadyFound.has(ext.capability)) continue;

    gaps.push({
      surface: 'solana-extension',
      selector: name,
      signature: name,
      capability: ext.capability,
      note:
        `This mint is configured with the ${name} extension, so ${ext.implies}. No pattern in the ` +
        `dictionary reads it, and nothing else resolved ${ext.capability} for this token. Unlike a ` +
        `function that merely exists in bytecode, an extension in this list is switched on now.`,
    });
  }

  // Stable order, so the same mint always produces the same score bytes.
  return gaps.sort((a, b) => a.selector.localeCompare(b.selector));
}
