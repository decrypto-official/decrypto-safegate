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

When no pattern matches, the result is `UNKNOWN` and coverage drops, so the gap is at least visible. But **a token using an admin pattern we have never seen will under-report its capabilities**, and we will not know it happened.

This is the failure mode we consider most likely, and it is why `patterns/` is open to contribution.

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
