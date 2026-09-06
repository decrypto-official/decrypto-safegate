# Disclosure

Any commercial relationship between the maintainer and an issuer rated by Safegate.

Generated from `registry/` by `npm run disclosure`. Do not edit by hand; CI fails if this file does not match the registry.

## Registry as of 2026-09-02

**No commercial relationship is declared with any issuer in the registry.** Every entry carries `commercialRelationship: null`. Declared, not audited: this file can only show what the registry records.

| Chain | Entries | With a declared relationship |
|---|---|---|
| Ethereum | 12 | 0 |
| Solana | 9 | 0 |
| **Total** | 21 | 0 |

## The rule

Decrypto, which publishes Safegate, has commercial interests in crypto. No payment is accepted from a token issuer for anything that touches a rating: no paid placement, no paid rating, no expedited registry review. Any other commercial relationship with an issuer is declared in that token's registry entry and appears here and on the token's page.

## How this stays honest

- The methodology and weights are published and the scorer is a pure function. A number a stranger can recompute cannot be bent by payment.
- There is no manual score, no override, and no allow-list outside the published methodology. Adding one would be a visible code change.
- `commercialRelationship` is a required field on every registry entry. Hiding a relationship means deleting a field, which shows in review and in git history.
- This file is generated and checked in CI.

See [GOVERNANCE.md](GOVERNANCE.md) for decision rights and disputes.

## Reporting a suspected undisclosed relationship

Open a public GitHub issue. A conflict-of-interest allegation handled in private is worthless as a control.
