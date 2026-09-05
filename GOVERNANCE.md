# Governance

Who decides what, how disputes resolve, and how the conflict of interest is contained.

## The conflict

Safegate is published by Decrypto, which has commercial interests in crypto. We are not claiming to have removed the conflict. What follows is how it is contained, and every item is checkable from outside.

## Containment

1. **Reproducibility.** The methodology and weights are published and the scorer is a pure function. Anyone recomputes any score without asking us. A number a stranger can recompute cannot be bent by payment.
2. **No override.** There is no manual score, no allow-list, and no adjustment outside the published methodology. Adding one would be a visible code change.
3. **Disclosure is generated.** `commercialRelationship` is a required field on every registry entry. `DISCLOSURE.md` is generated from those fields by `npm run disclosure`, and CI fails when the committed file does not match the registry. Hiding a relationship means deleting a field, which shows in review.
4. **Everything is in git.** Every pattern, entry, weight and change carries an author and a date.
5. **The demand-side rule.** Decrypto does not accept payment from token issuers for anything that touches a rating: no paid placement, no paid rating, no expedited registry review. Relaxing this rule requires changing this document first, in public.

Paid services may be built on Safegate, by the maintainer or anyone else, under Apache-2.0. The methodology and data stay open, and nobody can pay for a better score.

## Decision rights

| Decision | Who | How |
|---|---|---|
| Pattern additions | Any contributor proposes, maintainer merges | Meets `CONTRIBUTING.md`, passes CI |
| Registry additions | Any contributor proposes, maintainer merges | Two evidence kinds, named approver, review date |
| Methodology change | Maintainer | Version bump plus a `seed-scores` before/after table |
| Governance change | Maintainer | Public PR, never a silent edit |

There is a single maintainer today. That is a weakness. The mitigation is Apache-2.0: if the project stalls or is captured, the dictionary, registry and engine can be taken and continued by anyone.

## Disputes

Open a public GitHub issue. A dispute resolved in private is indistinguishable from one settled with money.

Disputes resolve in this order:

1. **Our reading of the chain is wrong.** A pattern misread the contract. Fix the pattern; the score changes.
2. **A pattern is missing.** The token uses a shape we do not cover. Add the pattern.
3. **A capability is justified but not in the registry.** Submit an entry with evidence, like anyone else. Being the issuer neither lowers nor raises the bar.
4. **You disagree with the methodology.** Argue it in the open. If the argument is good, the methodology changes for everyone.

What does not resolve a dispute: asserting the project is trustworthy, pointing to an audit, market cap, holder count, or any commercial relationship. Scores are corrected when wrong, never removed on request.
