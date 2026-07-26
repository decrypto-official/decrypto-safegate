# Methodology

**Version 0.1.0.** Every published score names the version it was computed under. Old versions stay runnable so historical scores can be reproduced.

The purpose of this document is to let a stranger recompute any Safegate score by hand, disagree with it precisely, and be right.

---

## 1. What is being measured

Not "is this token a scam". That is a prediction, and the state of the art cannot make it.

Safegate measures **structural capability**: what powers exist over this token right now, who holds them, whether anything justifies them, and how much of that we could actually verify.

A token with no dangerous capability can still fail. A token with several can be entirely legitimate. Both facts are why this is reported as capability with reasoning, never as a verdict.

---

## 2. Signal states

Every capability resolves to exactly one of four states.

| State | Meaning |
|---|---|
| `PRESENT` | The capability exists and nothing on record justifies it. |
| `EXPECTED` | The capability exists AND a reviewed registry entry justifies it for this exact token. |
| `ABSENT` | At least one pattern ran and confirmed the capability is not there. |
| `UNKNOWN` | We could not determine it. |

**`UNKNOWN` is never treated as `ABSENT`.** This is the single most important rule in the methodology. Commercial scanners omit fields rather than nulling them: GoPlus returns 19 fields for USDC and 40 for SHIB. Any system that reads a missing field as "clean" hands its best score to the tokens it understands least.

`UNKNOWN` is excluded from the axis calculation entirely, and reduces the coverage figure instead. Letting it lower the score would punish tokens for our blind spots. Letting it raise the score would be the bug above.

---

## 3. Capability to axis mapping

Every capability contributes to **exactly one axis**. Some plausibly belong to two, so the rule is: assign it to the axis where it does the most damage, and publish the choice.

| Capability | Axis | Weight |
|---|---|---|
| `mint-authority` | control | 10 |
| `freeze-authority` | control | 10 |
| `admin-authority` | control | 8 |
| `upgradeability` | control | 8 |
| `transfer-restriction` | exit | 7 |
| `fee-control` | exit | 5 |
| `metadata-mutability` | transparency | 1 |

### Why these weights

Mint and freeze are highest because they act directly on holders. Mint dilutes everyone; freeze targets one person and stops them leaving.

Upgradeability and admin authority sit just below because they are *indirect*: they grant the ability to grant themselves the others. Renounced ownership is close to security theatre when a proxy remains upgradeable, which is why `upgradeability` is weighted as heavily as a direct admin role.

`transfer-restriction` is assigned to **exit** rather than control, even though pausing is obviously insider power, because being unable to sell is how a holder actually loses money.

`metadata-mutability` is weighted **1 deliberately**. It fires on RAY, JUP and BONK, three well established tokens. Scoring it meaningfully would manufacture false positives across an entire blue-chip set. It is reported for completeness and near enough ignored, and saying so explicitly is part of publishing a methodology.

---

## 4. Axis calculation

For each axis:

```
value = round( 100 * sum(weight of PRESENT signals) / sum(weight of resolved signals) )
```

where *resolved* means `PRESENT`, `EXPECTED` or `ABSENT`. `UNKNOWN` appears in neither term.

`EXPECTED` counts in the denominator but not the numerator. The capability is real and was checked; the registry explains why it is there. This is what makes a regulated stablecoin score 0 on control while its mint authority is plainly live and plainly displayed.

**Higher is worse, on every axis, always.** No axis inverts.

### Coverage

```
coverage = resolved signals / applicable signals
```

Reported per axis and overall. Below 60 percent, a warning is prepended to the limitations telling the reader to read the unresolved signals rather than the numbers.

---

## 5. The registry, and why it is not a classifier

The registry is a **deterministic lookup keyed on the exact contract address**.

It is tempting to infer a token's type at runtime: "this looks like a stablecoin, so mint authority is fine". That is trivially attacked. Name a token "USD Yield Vault", get classified as a stablecoin, inherit a blanket pardon for the mint and freeze pair, then use the live mint to drain the peg. Matching the archetype *is* the disguise.

Requiring a reviewed entry keyed on the address removes the attack, because an address cannot be spoofed and an entry cannot be created without evidence and a named approver.

A registry entry:

- applies to one address on one chain
- lists specific capabilities as expected, each with a justification and what constrains it
- carries at least two independent evidence items, of at least two different kinds
- names its approver and the date it was verified
- **expires.** Past `reviewDue` it stops granting `EXPECTED` and the token falls back to structural scoring. A registry that vouches forever is one nobody is maintaining.

A registry entry never says a token is safe. It says a named capability is structurally normal for this issuer, and shows why.

---

## 6. Patterns, and combining them

A pattern says where to look for one capability on one contract shape. It makes no judgement.

**When several patterns target one capability, any hit wins.** Reading EIP-1967 alone says USDC is not a proxy. Reading the zeppelinos slot says it is. The correct answer is `PRESENT`, because independent probes for the same thing make a hit stronger evidence than a miss.

### Two meanings of "present"

Declared per pattern, because they genuinely differ:

- **`non-empty-value`**: the returned value decides. `owner()` returning the zero address means ownership really was renounced.
- **`call-success`**: the function existing decides. `paused()` returning `false` still proves a pause mechanism is built in and somebody holds the pauser role. **Capability is what gets scored, not whether it is engaged right now.**

Missing this distinction is a live bug in naive implementations: USDC's `paused()` returns false, and a value-based reading would call the capability absent.

### When no pattern matches

`UNKNOWN`, and coverage drops. A gap in the dictionary must be visible in the output, never silently forgiving.

---

## 7. Sources and disagreement

On-chain reading is primary. GoPlus and RugCheck corroborate.

Because we read the chain ourselves, our source **overlaps with both** third parties, which makes genuine cross-checking possible. Where readings conflict, the disagreement is recorded and displayed with both values. Neither is assumed correct, and the capability is reported as unresolved.

### Values we cannot verify

Some figures are simply unavailable to us. Holder concentration on Solana is the current example: the public RPC permanently rate limits `getTokenLargestAccounts`, which is an expensive scan.

The rule: **our own reading is `UNKNOWN`, and the third-party figure is displayed beside it under explicit attribution, outside the score.** The reader sees exactly two things, what we verified and what someone else claims, and never a blend of the two presented as ours.

---

## 8. The incident axis

Reported as the literal `insufficient-data`, not as a number.

Detecting what has already gone wrong needs transaction history that the current sources do not provide. A bare `0` would read as "no incidents, therefore safe", which is false for every fresh token, and most tokens that rug have a clean history right up until they do not.

When a history adapter exists, this becomes a flag list. It will stay separate from the live axes, because "could go wrong" and "already went wrong" are different questions and merging them is how a score becomes opaque.

---

## 9. Reproducibility

`src/scoring/model2.ts` is a **pure function**. No network, no filesystem, no clock, no randomness. Timestamps and input hashes are passed in.

Every score carries its `methodologyVersion` and an `inputSnapshotHash`. Given the same inputs and version, the output is byte-identical, and this is asserted in the test suite.

That is the whole basis of the claim in the README. If the scorer could reach the network, "reproducible" would be marketing.

---

## 10. Changing this methodology

Weights and mappings are data, in `src/signals/normalise.ts` and versioned alongside the code. A change to any number in this document is a methodology version bump, and must state what it changes, why, and which tokens' scores move as a result.

See [GOVERNANCE.md](GOVERNANCE.md).
