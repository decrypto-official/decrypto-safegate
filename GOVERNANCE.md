# Governance

Who decides what, how disputes get resolved, and how the conflict of interest is contained.

---

## The conflict

Safegate is published by **Decrypto**, which has commercial interests in crypto.

Anyone publishing ratings while holding commercial interests in the rated industry has a conflict, and we are not claiming to have removed ours. What follows is how it is contained. Every one of these is checkable from outside.

---

## Containment

### 1. Reproducibility over promises

The methodology is published. The weights are published. The scorer is a pure function with no network access. Given the same inputs, anyone recomputes the same score without asking our permission.

A number a stranger can recompute cannot be bent by payment. This is the primary control, and everything else is secondary to it.

### 2. Rating and business are separate pipelines

There is no path by which a commercial conversation alters a score. Concretely:

- Registry entries require evidence and a named approver, recorded in the file
- The `commercialRelationship` field is mandatory on every entry
- No score adjustment mechanism exists outside the published methodology. There is no override, no manual score, no allow-list that bypasses the algorithm

If someone adds one, that is a breach of this document and visible in git history.

### 3. Disclosure is automatic

`commercialRelationship` propagates to [DISCLOSURE.md](DISCLOSURE.md) and to the token's page. It is generated from the registry rather than hand-maintained, so forgetting to disclose requires actively removing a field, which shows up in review.

### 4. Public by construction

Every registry entry, every pattern, every weight, and every change to them lives in git with an author and a date. Someone who suspects a score was bought can read the diff.

### 5. The demand-side rule

**Decrypto does not accept payment from token issuers for anything that touches a rating.**

No paid placement, no paid rating, no expedited registry review. If this rule is ever relaxed, it must be changed here first, in public, before any money moves.

---

## On paid services

Paid services may get built on top of Safegate: hosted APIs, integrations, tooling. The Apache-2.0 licence permits that for the maintainer and equally for anyone else.

Two things do not change when money is involved:

1. **The methodology and the data stay open.** A paid service may add convenience, support or scale. It may never add a scoring path that is not published here.
2. **Nobody can pay for a better score.** Not issuers, not customers, not partners. There is no override in the code, and adding one would be visible in git history.

---

## Decision rights

| Decision | Who | How |
|---|---|---|
| Pattern additions | Any contributor proposes, maintainer merges | Must meet `CONTRIBUTING.md` and pass CI |
| Registry additions | Any contributor proposes, maintainer merges | Two evidence kinds, named approver, review date |
| Methodology change | Maintainer | Version bump plus a published diff of affected scores |
| Disputed score | See below | |
| Governance change | Maintainer | Public PR, never a silent edit |

There is a single maintainer today. That is a weakness and we are not going to pretend otherwise. The mitigation is that everything is forkable under Apache-2.0: if this project stalls or is captured, the dictionary and registry can be taken and continued by anyone, with no permission needed.

---

## Disputes

A project that believes its score is wrong should open a GitHub issue. This process is public on purpose, because a dispute resolved in private is indistinguishable from a dispute settled with money.

**How disputes actually resolve, in order:**

1. **Is our reading of the chain factually wrong?** If a pattern misread the contract, this is a bug. Fix the pattern, the score changes, done. This is the most common case and the easiest.
2. **Is a pattern missing?** If the token uses a shape we do not cover and we under- or over-reported as a result, add the pattern.
3. **Is a capability justified but not in the registry?** Submit a registry entry with evidence, like anyone else. Being the issuer does not lower the bar, and it does not raise it.
4. **Do you disagree with the methodology itself?** That is a legitimate position and it is why the methodology is published. Argue it in the open. If the argument is good, the methodology changes for everyone, not for one token.

**What will not resolve a dispute:** asserting the project is trustworthy, pointing to an audit, pointing to market cap, being widely held, or any commercial relationship whatsoever.

**Scores are not removed on request.** They are corrected when they are wrong.

---

## If the maintainer changes hands or changes direction

Every published version stays Apache-2.0 permanently, so anyone can pick up the engine, the dictionary and the registry at any point and continue them independently. The methodology is published in full, so a fork does not even need this code.

What Apache-2.0 does not do is prevent enclosure. Someone can take this work into a closed product without sharing anything back, and so can the maintainer. That is the trade: the project optimises for being usable rather than for controlling how it is used.
