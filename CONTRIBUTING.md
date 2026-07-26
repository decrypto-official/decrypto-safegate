# Contributing

Two directories carry almost all the value here, and both are plain JSON. You do not need to read the TypeScript to contribute something important.

- **`patterns/`** teaches Safegate to read a contract shape it does not understand yet.
- **`registry/`** records that a capability is expected for a specific token, with evidence.

The bar below is high on purpose. The registry is the part people have to trust, and a standard that is not enforced is not a standard. If you are forking Safegate and want your changes merged upstream, this is what you have to meet.

---

## Adding a pattern

A pattern is the highest-leverage contribution in the project. One JSON file can make thousands of tokens readable, because patterns scale with **contract shapes**, not with tokens.

### Requirements

1. **Validates against `patterns/schema.json`.** CI enforces this.
2. **The `id` field matches the filename.** Enforced at load time.
3. **At least one real, verified mainnet address in `coversExamples`**, with what you observed and the date you checked. The test suite checks these, so a pattern citing nothing or citing a malformed address fails CI.
4. **`rationale` says what breaks without this pattern.** "Adds coverage" is not a rationale. "Without this, upgradeable tokens deployed before 2019 read as immutable" is.
5. **`knownFalseNegative` if relying on this pattern alone can mislead.** This is the most valuable field in the file, not an admission of weakness. Look at `patterns/evm/admin-ownable.json`: it documents that `owner()` reverting on UNI does not mean renounced. That warning is worth more than the pattern.
6. **`presenceIndicatedBy` set correctly.** Does the returned value decide, or does the function merely existing decide? `paused()` returning `false` still proves a pause mechanism exists. Getting this wrong is a live bug class.

### What a pattern must not contain

No judgement. A pattern says *where to look and how to read the bytes*. Whether the result is good or bad is decided once, in `signals/` and `registry/`. A pattern that encodes an opinion will be rejected.

---

## Adding a registry entry

Higher bar, because an entry converts a `PRESENT` capability into `EXPECTED` and directly lowers a score. That is exactly the mechanism a bad actor would want to abuse.

### Requirements

1. **Validates against `registry/schema.json`.**
2. **At least two evidence items, of at least two different kinds.** On-chain observation alone is not enough, because it proves what exists rather than why it is justified. Documentation alone is not enough, because projects describe intentions rather than deployed reality. You need both.
3. **Every expected capability carries a real justification.** It must explain why the token cannot function, or cannot comply with law, without that capability. Compare:
   - Rejected: "The team needs mint authority for operations."
   - Accepted: "A liquid staking token must mint on deposit, otherwise the product cannot exist. The authority is held by the stake pool program, not a person, and minting is mechanical against deposited SOL rather than discretionary."
4. **`constrainedBy` states what limits the power.** A timelock, a multisig, a regulator, a published policy. "Nothing" is an acceptable answer and must be said out loud.
5. **`caveats` states what the entry does NOT mean.** Every entry needs these. Being in the registry never means safe.
6. **`reviewDue` set, normally one year out.** Entries expire.
7. **`commercialRelationship` declared.** Any commercial relationship between the maintainer and the issuer goes here, and it propagates automatically to `DISCLOSURE.md` and the token's page. Omitting it is the most serious violation possible in this repository.

### What will get an entry rejected

- Evidence that is all one kind
- A justification that reduces to "they are trustworthy"
- Any suggestion of a relationship between listing and payment
- A token that is simply popular. Popularity is not a capability justification.

---

## Changing the methodology

Weights, the capability-to-axis mapping, and the scoring formula are the methodology. Changing any of them requires:

1. A version bump in `METHODOLOGY.md` and `src/scoring/model2.ts`
2. A statement of what changes and why
3. **Which tokens' scores move as a result, and by how much.** Run the seed set before and after and include the diff. A weight change that quietly reranks half the registry is not acceptable without that table.

---

## Code

- `src/scoring/model2.ts` **must stay pure.** No network, no filesystem, no clock, no randomness. This is what makes the reproducibility claim testable rather than decorative. A PR adding I/O there will be rejected regardless of what it does.
- Everything else: match the surrounding style. Comments explain *why*, not *what*.
- `npm test` must pass. The regression suite hits live RPC endpoints deliberately: mocking them would test the mocks rather than our reading of the chain.

---

## Dashboard

One rule outranks everything else in the interface: **a bare score must be impossible to see.** Axes, coverage, reasoning and provenance always travel together. A component that renders a number without its coverage figure will be rejected however good it looks, because a lone number is what gets screenshotted and misquoted as "Safegate says safe".

Beyond that: fill the viewport (no `max-width` on page containers), monospace and tabular figures for all data, `UNKNOWN` as visually prominent as `PRESENT`, third-party values always marked as such, and one animation library.

---

## Sign your commits: the DCO

Every commit needs a sign-off line:

```bash
git commit -s -m "add pattern for X proxy shape"
```

That appends `Signed-off-by: Your Name <your@email>` and certifies the [Developer Certificate of Origin](DCO): that you wrote the contribution, or have the right to submit it, and that you are permitted to license it under this project's terms.

**Why this project asks for it.** Safegate output feeds decisions about money. A pattern or registry entry copied out of a commercial scanner's internals, or lifted from a proprietary dataset, would be a legal and reputational problem in a project whose entire value is being trustworthy. The DCO makes you affirm the contribution is yours to give.

It is a sign-off line, not a legal agreement to read, and **it does not assign copyright or grant anyone the right to relicense your work.**

---

## Licence of contributions

Everything in this repository is [Apache-2.0](LICENSE), and contributions ship under the same licence. Code, patterns, registry entries, docs.

**You keep your copyright.** There is no copyright assignment and no contributor licence agreement.

One consequence worth being explicit about: because Apache-2.0 is permissive, anyone may use this in a closed commercial product, and that includes both the maintainer and anyone else. If you would rather your work only ever appeared in open software, this is not the project for that, and it is better to know before you contribute than after.
