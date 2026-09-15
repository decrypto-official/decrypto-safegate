# Working in this repository

## Review every change before it lands

Run `/code-review` on the diff of every task, after the work is committed and
before reporting it as done. Do not skip it because the change looks small or
because the tests pass — on this repository the tests passing is the weakest
signal available, since most of what can go wrong is a reading that is
confidently wrong rather than code that throws.

Act on what it finds, in a separate commit, and say in the PR what it found.
If a finding is wrong, say why rather than silently ignoring it.

Add `/security-review` when a change touches how a score is computed, what the
registry grants, or anything a published number depends on.

Two things the review has already caught here that nothing else would have:

- **Prose that disagreed with the committed measurement.** 0.7.0 shipped a
  sample file labelled as a "before" run that had actually been produced after
  part of the fix was in. Every figure in UPDATE.md, METHODOLOGY.md and
  LIMITATIONS.md must be checked against the file it cites, mechanically, not
  recalled. On a project whose whole claim is reproducibility, a number in the
  docs that the data does not support is worse than a bug.
- **A guard that could manufacture an all-clear.** A failed RPC read was being
  counted as "nothing there". Anywhere a read can fail, ask what the failure
  looks like downstream: if it looks like a clean result, that is the bug.

## Verifying a change

The full sequence CI runs, in order:

```bash
npm run typecheck
npm run validate            # patterns and registry load and satisfy the schema
npm run disclosure:check    # DISCLOSURE.md is generated; a stale copy fails
npm test                    # offline
cd apps/web && npm ci && npm run build   # traces patterns/ and registry/ into the routes
```

`npm run test:live` reads mainnet and is the one that catches a wrong reading.
Run it before opening a PR that changes what any pattern or rule reads. Skipped
live tests prove nothing.

`npm run census` and `npm run sweep` are measuring instruments, not gates. They
need live RPC and they exit 0 whatever they find.

## What this project is strict about

- **Absence is never safety.** A read that failed is `UNKNOWN`, never `ABSENT`.
  The one place an absence is scored — EVM metadata mutability — is documented
  as the weakest claim in the project, and is why `npm run sweep` exists.
- **A pattern needs a verified positive** on a real mainnet address, in
  `coversExamples`, with the date. A pattern with no observed hit is a guess.
  The privileged-function table is the exception: a guess there costs a line,
  while a missing entry can cost a false clean reading.
- **Every number in the docs is measured**, including score movement. A
  methodology bump requires a before/after table produced by running both
  versions, not estimated.
- **Bytecode presence is not a reading.** The gap scanner says a privileged
  function exists and we cannot read it; a pattern says we can read who holds
  it. Collapsing the two deletes the instrument that finds our own blind spots.

## Conventions

- Develop on the branch named in the session prompt, never on `main`.
- Do not add a `Signed-off-by` line. The DCO is the author's attestation to
  make; leave the PR checkbox unticked and say so.
- Comments explain why a decision was made and what breaks without it. Match
  the density of the surrounding file, which is high on purpose.
