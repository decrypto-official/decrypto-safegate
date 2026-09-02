# Limitations

What Safegate cannot tell you.

**If you read nothing else: a good Safegate score is not permission to buy anything.**

---

## 1. This is structural, not predictive

Safegate reads what a token's code can do. It does not and cannot predict what anyone will do with it.

The research literature agrees. The most rigorous published Solana rug pull detection we found is explicitly **retrospective**: it identifies state changes that have already happened, and its authors note it misses slow-moving scams and anything outside its observation window.

Nothing in this repository predicts a rug. Anyone claiming otherwise, including anyone forking this project, is overselling it.

---

## 2. Off-chain risk is completely invisible

The chain records what happened, never why or who intended it. Safegate cannot see:

- **Team intent.** The most important variable, and entirely unobservable.
- **Custody arrangements.** WBTC's value depends on BitGo actually holding bitcoin. No amount of contract reading verifies a vault.
- **Private agreements.** Side deals, undisclosed allocations, verbal commitments.
- **Hidden unlock schedules** held off-chain.
- **Key management.** An "expected" mint authority held by a compromised key is indistinguishable on-chain from a safe one.
- **Legal and regulatory exposure.**

These are the vectors most rug pulls actually use. Structural analysis is close to blind to all of them.

---

## 3. Coverage is not safety

A coverage figure of 100 percent means we resolved every check we know how to make. It does not mean the token is safe, and it does not mean nothing else is checkable.

Coverage measures **our completeness, not the token's virtue.** A simple token with nothing to find scores high coverage trivially.

---

## 4. The registry is human judgement

Entries are written and approved by people. That is a deliberate trade: an automatic classifier would be reproducible but trivially gamed, since anything presenting as a stablecoin would inherit a pardon for the most dangerous capability pair a token can hold.

The consequences of choosing human judgement:

- **An entry can be wrong.** A capability we called expected may be abused.
- **Entries go stale.** They expire for that reason, but an issuer can change behaviour the day after review.
- **Absence of an entry means nothing.** Most legitimate tokens are not in the registry. It is small on purpose.
- **`EXPECTED` is not `SAFE`.** It means the capability is structurally normal and justified. The holder can still use it. Circle can freeze your USDC, and that is precisely what the entry says.

---

## 5. Patterns are always incomplete

The dictionary covers the contract shapes we know. New shapes appear constantly.

When no pattern matches, the result is `UNKNOWN` and coverage drops, so the gap is at least visible.

Since 0.1.4 there is a second line of defence for the harder case, where no pattern applies and nothing would otherwise be emitted at all. We scan the token's privileged surface, subtract the parts our patterns already read, and publish what is left as `dictionaryGaps`. On Ethereum that surface is the contract's runtime bytecode, so a token with a `setMinter` we cannot read is flagged as unaccounted for rather than passing silently. Since 0.1.8 the Solana surface is the mint's Token-2022 extension list.

**That is a narrower fix than it sounds, and the failure mode is not closed.** On Ethereum the scan matches against a table of signatures we thought to include, so a privileged function named something we did not anticipate is invisible to the scan for exactly the reason it is invisible to the dictionary, and **a token using an admin pattern we have never seen can still under-report its capabilities**. The scan shortens the list of ways that happens; it does not end it.

Solana is the better half of this, and it is worth being precise about why. The extension list is enumerable, so an extension we have never classified is *reported* rather than skipped — with no capability named, because naming one would be a guess. That closes the never-seen-it case on the Token-2022 surface specifically. It does not close anything beyond that surface: a mint's relationship to any other program is outside what the extension list can tell us.

Two further bounds worth stating plainly:

- **A gap is not a finding.** It says a capability is unaccounted for, never that it is present. It moves no axis and no coverage figure.
- **A detected gap is not always a closable one.** Finding the gap and being able to read the capability are separate problems, and 0.1.5 is where that became concrete. Our reader calls a function with no arguments, so a privileged function taking parameters cannot be called at all, and authority held in a mapping has no fixed storage slot to read. DAI is both cases at once: `mint(address,uint256)` takes arguments, its `wards` authorisation is a mapping, and the contract exposes no zero-argument admin getter of any kind. That gap is reported on every DAI score and we currently have no way to close it.
- **The scan covers both chains, but not equally.** On EVM it reads runtime bytecode; on Solana it reads the mint's Token-2022 extension list. The Solana surface is narrower: it sees what the Token-2022 program itself declares, and nothing about a mint's relationship to any other program. A legacy Token mint counts as fully scanned because its privileged surface is exactly the two authorities we read — but note that this says nothing about Metaplex metadata, which lives in a separate account and is frequently unreadable. The `gapScan` field on every score says whether the scan ran.
- **A Token-2022 extension we have never classified is reported with no capability named.** We can see that a power is configured and we cannot say what it permits. This is deliberately not resolved into a guess, and it means a score can be complete on its own terms while still leaving a named unknown on the mint.

This remains the failure mode we consider most likely, and it is why `patterns/` is open to contribution.

---

## 6. Solana holder concentration is not ours

We do not verify it. The public RPC permanently rate limits the call required. Any concentration figure shown comes from a third party, is labelled as such, and is excluded from the score.

More broadly: **concentration is ambiguous even when measured.** A genuine treasury, vesting contract or locker is indistinguishable on-chain from a whale about to dump, unless the address happens to be labelled, and it often is not. Two of the highest-concentration tokens we tested were established blue chips.

---

## 7. What the score cannot rank

Safegate compares **structure**, not quality, value or prospects. It has nothing to say about whether a token is a good investment, whether its price is reasonable, whether its team is competent, or whether its product works.

A token can score zero on every axis and be worthless.

---

## 8. Third-party sources can be wrong

We corroborate against GoPlus and RugCheck. They are useful and they are not infallible. Where our reading conflicts with theirs, we show both and treat the capability as unresolved rather than picking a winner.

---

## 9. Point-in-time

Every score is a snapshot. An upgradeable contract can change the next block. A registry entry reflects the day it was reviewed. Always check `computedAt`.

---

## 10. Not financial advice

Safegate is an informational tool. Its publisher has commercial interests in crypto, declared in [DISCLOSURE.md](DISCLOSURE.md).

Nothing here is financial, investment or legal advice, and nothing here is a recommendation to buy, sell or hold anything.
