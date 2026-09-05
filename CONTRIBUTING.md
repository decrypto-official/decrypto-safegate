# Contributing

Two directories carry most of the value, and both are plain JSON.

- `patterns/` teaches Safegate to read a contract shape it does not understand yet. One file can make thousands of tokens readable, because patterns scale with contract shapes, not tokens.
- `registry/` records that a capability is expected for one specific address, with evidence.

The bar is high on purpose. The registry is the part people have to trust.

## Adding a pattern

1. Validates against `patterns/schema.json` and `npm run validate`.
2. `id` matches the filename.
3. `method.kind` carries its field: `storageSlot`, `callSelector`, `accountField`, or `extension`. A pattern without it is refused at load.
4. At least one real mainnet address in `coversExamples`, with what you observed and the date. Verify it against the chain before writing it down; a claim you could not verify is written as NA, not guessed.
5. `rationale` says what breaks without this pattern. "Adds coverage" is not a rationale.
6. `knownFalseNegative` if relying on this pattern alone can mislead. It is the most useful field in the file.
7. `presenceIndicatedBy` set correctly. `call-success` means the function existing is the finding; `non-empty-value` means the returned value decides.
8. Call-selector patterns send the selector alone. A view function that needs a parameter may declare a fixed dummy argument in `method.callArgs`, only with `presenceIndicatedBy: call-success`. Never a write function.

A pattern contains no judgement. It says where to look and how to read the bytes.

## Adding a registry entry

Higher bar: an entry turns `PRESENT` into `EXPECTED` and lowers a score, which is exactly what a bad actor wants.

1. Validates against `registry/schema.json`.
2. At least two evidence items of at least two kinds. On-chain alone proves what exists, not why; documentation alone describes intentions, not deployment.
3. Every expected capability explains why the token cannot function or comply without it. "The team needs it for operations" is rejected.
4. `constrainedBy` names what limits the power. "Nothing" is an acceptable answer and must be said.
5. `caveats` says what the entry does not mean.
6. `reviewDue` set, normally one year out.
7. `commercialRelationship` declared, or explicitly `null`. Omitting it is the most serious violation in this repository.

Rejected: evidence all of one kind, a justification that reduces to "they are trustworthy", any link between listing and payment, popularity.

## Changing the methodology

Weights, axis mapping, formula, and what counts as applicable. Requires a version bump in `METHODOLOGY.md` and `src/scoring/model2.ts`, a statement of what changed and why, and a before/after table of the seed set from `npm run seed-scores` on both versions. Numbers come from live runs, never from memory.

## Code

- `src/scoring/model2.ts` stays pure. A PR adding I/O there is rejected regardless of what it does.
- `npm test` is offline and runs on every PR. `npm run test:live` reads mainnet and runs nightly; run it by hand before a release and when you change a pattern.
- `npm run validate` and `npm run disclosure:check` must pass.
- Comments explain why, not what.

## Dashboard

A bare score must be impossible to see. Axes, coverage, reasoning and provenance travel together. `UNKNOWN` is as visible as `PRESENT`. Third-party values are always marked.

## Sign your commits

```bash
git commit -s -m "add pattern for X proxy shape"
```

The sign-off certifies the [Developer Certificate of Origin](DCO): the contribution is yours to give. It assigns no copyright and grants no relicensing rights. A pattern or entry copied from a commercial scanner's internals would be a legal and reputational problem in a project whose value is being trustworthy.

## Licence

Apache-2.0, whole repository, contributions included. You keep your copyright. Apache-2.0 permits closed commercial use of your contribution by anyone, including the maintainer. Know that before you contribute.
