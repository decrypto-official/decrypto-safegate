## What this changes

<!-- One or two sentences. -->

## Type

- [ ] New pattern (`patterns/`)
- [ ] New or updated registry entry (`registry/`)
- [ ] Methodology change (weights, axis mapping, formula)
- [ ] Code
- [ ] Docs

## Sign-off

- [ ] Every commit is signed off (`git commit -s`), certifying the [DCO](../DCO)

## If this is a pattern

- [ ] Validates against `patterns/schema.json` (`npm run validate`)
- [ ] `id` matches the filename
- [ ] `coversExamples` has at least one real mainnet address, with what you observed and the date
- [ ] `rationale` says what breaks without this pattern, not just that it adds coverage
- [ ] `knownFalseNegative` filled in if relying on this pattern alone can mislead
- [ ] `presenceIndicatedBy` set correctly (does the returned value decide, or does the function merely existing decide?)

## If this is a registry entry

- [ ] At least two evidence items, of at least two different kinds
- [ ] Every expected capability explains why the token cannot function or comply without it
- [ ] `constrainedBy` states what limits the power, or says plainly that nothing does
- [ ] `caveats` states what the entry does NOT mean
- [ ] `reviewDue` set
- [ ] `commercialRelationship` declared, or explicitly `null`

## If this changes the methodology

- [ ] Version bumped in `METHODOLOGY.md` and `src/scoring/model2.ts`
- [ ] Included a before/after diff of the seed set showing which scores move

## Licence of this contribution

Apache-2.0, same as the rest of the repository. You keep your copyright;
there is no copyright assignment. Note that Apache-2.0 permits closed
commercial use of your contribution, by anyone.
