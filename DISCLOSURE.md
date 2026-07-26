# Disclosure

Any commercial relationship between the maintainer and an entity rated by Safegate.

**Generated from `registry/`. Do not edit by hand.** Run `npm run validate` to check it.

---

## Current status, 2026-07-26

**No commercial relationships exist with any issuer in the registry.**

All 20 entries carry `commercialRelationship: null`, verified programmatically rather than asserted.

| Chain | Entries | With a commercial relationship |
|---|---|---|
| Ethereum | 12 | 0 |
| Solana | 8 | 0 |
| **Total** | **20** | **0** |

---

## The conflict

Safegate is published by Decrypto, which has commercial interests in crypto, including user subscriptions, exchange referrals, and potentially paid services built on Safegate itself.

Anyone publishing ratings while holding commercial interests in the rated industry has a conflict. Ours is structural and we are not claiming to have removed it.

## The rule

**No payment is accepted from token issuers for anything that touches a rating.** No paid placement, no paid rating, no expedited registry review.

Where a commercial relationship with an issuer exists for any other reason, it is declared in that token's registry entry and appears here and on the token's page automatically.

---

## How this stays honest

Four controls, each checkable from outside without asking anyone's permission.

**Reproducibility.** The methodology and weights are published, and the scorer is a pure function with no network access. A number a stranger can recompute cannot be bent by payment. This is the primary control and everything else is secondary.

**No override exists.** There is no manual score, no allow-list that bypasses the algorithm, and no adjustment mechanism outside the published methodology. Adding one would be a visible code change.

**Disclosure is a required field.** `commercialRelationship` cannot be omitted from a registry entry, only set to `null`. This file is generated from those fields, so concealing a relationship means actively deleting a field, which shows up in review and in git history.

**Everything is in git.** Every registry entry, every pattern, every weight, and every change to them carries an author and a date. Anyone who suspects a score was bought can read the diff.

See [GOVERNANCE.md](GOVERNANCE.md) for decision rights and how disputes are resolved.

---

## Reporting a suspected undisclosed relationship

Open a public GitHub issue. Do not email. A conflict-of-interest allegation handled in private is worthless as a control, because the outcome cannot be distinguished from a settlement.
