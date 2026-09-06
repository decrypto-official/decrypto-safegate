# Methodology

**Version 0.2.0.** Every score names the version it was computed under. The purpose of this document is to let a stranger recompute any Safegate score by hand, disagree with it precisely, and be right.

## 1. What is measured

Structural capability: what powers exist over this token right now, who holds them, whether anything on record justifies them, and how much of that we could verify. Not "is this a scam". A token with no dangerous capability can still fail; a token with several can be legitimate. So the output is capability with reasoning, never a verdict.

## 2. Signal states

| State | Meaning |
|---|---|
| `PRESENT` | The capability exists and nothing on record justifies it. |
| `EXPECTED` | The capability exists and a reviewed registry entry justifies it for this exact address. |
| `ABSENT` | A pattern ran and confirmed the capability is not there, or the chain's program cannot provide it. |
| `UNKNOWN` | We could not determine it, including when no pattern reads this capability on this chain. |

`UNKNOWN` is never treated as `ABSENT`. It is excluded from the axis value and reduces coverage instead.

## 3. Capabilities, axes, weights

Every capability contributes to exactly one axis, the one where it does the most damage.

| Capability | Axis | Weight |
|---|---|---|
| `mint-authority` | control | 10 |
| `freeze-authority` | control | 10 |
| `admin-authority` | control | 8 |
| `upgradeability` | control | 8 |
| `transfer-restriction` | exit | 7 |
| `fee-control` | exit | 5 |
| `metadata-mutability` | transparency | 1 |

Mint and freeze act directly on holders. Upgradeability and admin authority are indirect: they grant the ability to grant the others. Transfer restriction sits on exit because being unable to sell is how a holder loses money.

**Weights are relative within an axis.** The axis value is a ratio, so a weight only matters against the other capabilities on the same axis. `metadata-mutability` is the only transparency capability, so its weight of 1 does not soften it: the transparency axis reads 100 when metadata is mutable and unjustified, 0 when it is not, and n/a when it could not be read. That is what the formula produces, and this document says so rather than pretending the low weight makes the signal quiet. Adding further transparency capabilities is the fix.

## 4. Axis value and coverage

```
axis     = round(100 * sum(weight of PRESENT) / sum(weight of RESOLVED))
RESOLVED = PRESENT + EXPECTED + ABSENT
coverage = resolved signals / applicable signals
```

`UNKNOWN` appears in neither term of the axis. `EXPECTED` counts in the denominator but not the numerator: the capability is real and was checked, and the registry says why it is there. Higher is worse on every axis. An axis with nothing resolved carries `assessed: false` and renders as n/a, never as 0.

**Applicable is every capability, on every chain.** Since 0.2.0 all seven capabilities are in the denominator for every token. A capability that no pattern reads on that chain is emitted as `UNKNOWN` with that reason, so a dictionary gap shows up in the coverage figure. Before 0.2.0 an unread capability was simply missing, and an Ethereum token could report 4 of 4 when the dictionary could see 4 of 7.

Adding a resolved capability to the denominator dilutes an axis. When 0.2.0 began reading freeze authority on Ethereum, tokens that carry an admin but no blacklist moved from 31 to 22 on control. The number changed because the reading got more complete, not because the token did.

Below 60% coverage a warning is prepended to the limitations.

## 5. The registry is a lookup, not a classifier

The registry is keyed on the exact address. It records that a named capability is structurally normal for that issuer, with at least two kinds of evidence, a justification, what constrains the power, a named approver, and an expiry date. Past `reviewDue` an entry stops granting `EXPECTED`.

Inferring a token's type at runtime is trivially gamed: name a token "USD Yield Vault", get classified as a stablecoin, inherit a pardon for mint and freeze. An address cannot be spoofed. An entry never says a token is safe.

## 6. Patterns

A pattern says where to look for one capability on one contract shape: a storage slot, a function selector, an account field, or a Token-2022 extension. It makes no judgement.

**Several patterns, one capability: any hit wins.** Reading EIP-1967 says USDC is not a proxy; reading the zeppelinos slot says it is. Independent probes make a hit stronger evidence than a miss.

**Two meanings of present, declared per pattern.** `non-empty-value`: the returned value decides, so `owner()` returning zero means renounced. `call-success`: the function existing decides, so `paused()` returning false still proves a pause mechanism.

**Empty return data is not an answer.** A contract whose fallback accepts any calldata answers every selector with nothing. WETH9 does this. A `call-success` probe requires at least one 32-byte word of return data; empty data reads as "function not present".

**Fixed-argument probes.** A view function that needs a parameter, such as `isBlacklisted(address)`, is called with a fixed dummy argument declared in the pattern as `callArgs`. Only allowed with `call-success`, because the value returned for a dummy argument means nothing; the function answering is the finding.

**`nonEmptyMeans: capability-absent`** inverts a read for flags that record a capability being switched off, such as `mintingFinished()`.

## 7. What the dictionary reads, per chain

| Capability | Ethereum | Solana |
|---|---|---|
| `upgradeability` | proxy slots, UUPS | Token-2022 mint close authority |
| `mint-authority` | minter(), MintableToken, capped schedule | SPL mint authority |
| `freeze-authority` | blacklist getters (since 0.2.0) | SPL freeze authority |
| `admin-authority` | Ownable, DSAuth, AccessControl (working since 0.2.0), timelock, proxy admin | Token-2022 confidential transfer authority |
| `metadata-mutability` | no pattern, UNKNOWN | Metaplex update authority (read since 0.2.0), Token-2022 metadata |
| `transfer-restriction` | pausable | Token-2022 permanent delegate, transfer hook |
| `fee-control` | no pattern, UNKNOWN | Token-2022 transfer fee |

On a mint owned by the legacy Token program, a capability that exists only as a Token-2022 extension is recorded as `ABSENT` with the reason stated: the program has no mechanism for it, and its whole privileged surface is the two authorities the dictionary reads. That is a verified absence, not a guess.

### Beyond the dictionary: `dictionaryGaps` and `gapScan`

A contract can expose a privileged function that no pattern reads. On Ethereum the runtime bytecode carries the 4-byte selector of every function it dispatches; we scan it against a table of privileged signatures and subtract what patterns already read and what was already found. On Solana the surface is the mint's Token-2022 extension list, which is enumerable, so an extension we have never classified is reported with no capability named. What survives is published as `dictionaryGaps`.

**This is reported and never scored.** Knowing a function exists is not reading who holds it. A gap moves no axis and no coverage figure; it is prepended to the limitations. `gapScan` records whether the scan ran: `ran`, `not-applicable`, or `failed`. An empty gap list is only reassuring when it reads `ran`.

The residual blind spot is real: a privileged function whose signature is not in our table is invisible to the scan for the same reason it is invisible to the dictionary.

## 8. Sources

Every reading is our own, direct from public RPC. Third-party corroboration (GoPlus, RugCheck) is designed for, with a disagreement record in the score shape, and **not yet wired**: no third-party call is made in this version. Solana holder concentration is not read at all, because the public RPC rate limits the call required; it is declared as unverified with a null value, never filled from elsewhere.

## 9. The incident axis

Reported as the literal `insufficient-data`. Detecting what already went wrong needs transaction history the current sources do not provide, and a bare 0 would read as "no incidents, therefore safe".

## 10. Reproducibility

`src/scoring/model2.ts` is a pure function: no network, no filesystem, no clock, no randomness. Given the same signals and version it returns byte-identical output.

Every score carries `inputSnapshotHash`, which anyone can recompute from the observations in the published score. Canonical form: every on-chain observation as `[capability, patternId or null, value]`, with a value that could not be read as the string `"unavailable"`, sorted by capability then pattern id, JSON-serialised, SHA-256, first 32 hex characters. Timestamps and method notes are excluded so two reads of an unchanged contract hash the same.

## 11. Changing this document

Weights, the capability-to-axis mapping, the formula, and what counts as applicable are the methodology. Changing any of them bumps the version here and in `src/scoring/model2.ts`, and requires a before/after table of the registry seed set produced by `npm run seed-scores`, not by estimate. See [GOVERNANCE.md](GOVERNANCE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## 12. Versions

- **0.2.0** (2026-09-06). Every capability is applicable on every chain; unread ones are `UNKNOWN`. Extension-only capabilities on legacy Solana mints are verified `ABSENT`. Empty return data no longer counts as a function existing. Fixed-argument probes. The snapshot hash is canonical on both chains. Score movement is tabulated in [UPDATE.md](UPDATE.md).
- **0.1.0** (2026-07-26). First published version.
