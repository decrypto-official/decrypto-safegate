# Update log

Newest first. Each entry carries a date, a version, and what changed.

Versions follow [semver](https://semver.org). Since the score is the product:

- **major**: a breaking change to the score shape or to what a score means
- **minor**: new patterns, new registry entries, new capability coverage
- **patch**: bug fixes, docs, tooling

The methodology carries its own version in `METHODOLOGY.md`, currently 0.1.0. Any change to weights, the capability-to-axis mapping, or the formula bumps that too, and must publish which scores move as a result.

Grouped under **Added / Changed / Fixed / Removed**, following [Keep a Changelog](https://keepachangelog.com).

---

## 0.1.4, 2026-08-05

Applies the project's own rule to the tool's blind spots: where Safegate cannot see, that has to be visible rather than silent.

### Added

**An error boundary on the web app**, `apps/web/app/error.tsx`. `/patterns`, `/registry` and `/disclosure` call the loaders directly while rendering. Since 0.1.1 those loaders throw rather than returning an empty array, which is right, but with no boundary Next served its generic 500 and production hid the reason behind "a server-side exception has occurred". 0.1.1 gave `/api/score` an honest 503 and left these three pages opaque.

The boundary says plainly that the page could not be read, and that this is not evidence the registry or the dictionary is empty. A blank registry page and a registry page that failed to load are indistinguishable to a reader, and only one of them means "there is nothing here" — the same reasoning the scorer applies to a token capability.

React strips error messages from client boundaries in production and replaces them with an opaque `digest`, so the boundary does not try to echo the loader's explanation. It states what is true either way and surfaces the digest for correlation with the server log.

**A published contract for the score shape**, `src/scoring/schema.ts`. `GET /api/score` and `safegate score --json` hand the score object to code we do not control, and nothing here noticed when that shape changed. Adding `assessed` in 0.1.3 altered the contract and the whole suite still passed.

The contract is now enforced twice. At compile time, two assertions prove the zod schema and the `Score` interface describe the same shape in both directions, so adding a field to one and forgetting the other fails `npm run typecheck`. At runtime, every object is `.strict()`, so an undeclared field is an error rather than something carried along silently. Six tests cover a real score, the same score after a JSON round trip, and the drift cases: an extra field, a missing `assessed`, missing `limitations`, an axis value out of range.

There is deliberately no separate `score.schema.json`. Two maintained definitions of one shape drift apart, which is the failure this is meant to prevent. zod is already how `patterns/` and `registry/` are validated in `src/cli/validate.ts`.

`parseScore()` and `safeParseScore()` are exported for consumers who want the contract enforced on their side. Neither runs on the request path: the scorer builds the object, so validating our own output on every request would spend time catching a bug only a code change can introduce, and the tests already catch that.

**Detection of privileged functions no pattern reads.** `LIMITATIONS.md` §5 calls this the failure mode this project considers most likely: *"a token using an admin pattern we have never seen will under-report its capabilities, and we will not know it happened."* That gap was entirely invisible. No pattern matched, nothing was emitted, and the token read as clean — the tool applying to its own dictionary exactly the "absence means safety" rule it refuses to apply to a token.

A contract's runtime bytecode contains the 4-byte selector of every function it dispatches, so we can now ask what the dictionary cannot: does this contract answer to a privileged function no pattern of ours reads? `src/patterns/selectors.ts` walks the bytecode opcode by opcode, collects the selectors it pushes, and subtracts two things — any selector a pattern already calls, and any capability we already found positively another way. What survives is the case that matters, and it appears on the score as `dictionaryGaps`.

**It reports, it does not score.** No axis, no coverage figure and no signal state moves. Knowing a function exists is not the same as reading who holds it, and inferring one from the other is the guesswork the dictionary exists to avoid. A score with no gaps is byte-identical to one produced before this shipped, apart from gaining an empty list. Whether an unreadable capability should reduce coverage is a real question and a separate one: it would move every published score and so needs a methodology version and a before/after seed-set diff.

The finding is prepended to `limitations`, so it reaches the CLI, the dashboard and the API without any consumer changing, and both renderers show it above the signals: a reader who stops at the signal table would otherwise take an incomplete reading for a complete one.

**keccak256**, `src/sources/keccak.ts`, dependency-free. Selectors are derived from signature strings rather than hand-copied as hex constants, because a wrong constant would produce a table matching nothing and the report would be quietly useless instead of visibly broken. Locked against the published digests for the empty string and `"abc"`, and cross-checked against four widely-known ERC-20 and Ownable selectors. Note this is Keccak with 0x01 padding, not NIST SHA3-256 — Node's `crypto` offers the latter and they disagree on every input.

**`gapScan` on every score**, recording whether the scan above actually ran: `ran`, `not-applicable`, or `failed`. Without it an empty `dictionaryGaps` meant two different things — we looked and found none, and we never looked — and a reader could not tell which. The second case is every Solana score, since there is no bytecode analogue, and any EVM score whose bytecode fetch failed. Both now carry an explicit limitation saying the empty list reflects a check that did not happen. Left unstated, "we could not check" reads exactly like "we checked and it is clean", which is the failure this release exists to fix, reproduced inside the fix.

**A dictionary gap census**, `npm run census`, walking the registry seed set and reporting per token what the scan found: scanned with no gaps, scanned with gaps and which capabilities, not applicable, or unreadable. It exists to answer the question §10 of `METHODOLOGY.md` defers — should a gap reduce coverage? — on real numbers rather than an estimate, since that decision moves every published score and depends on how often gaps actually occur.

It measures and does not gate. A token with gaps is a finding, not a fault, and the CI step is `continue-on-error` so a public endpoint having a bad minute cannot block a merge. One unreadable token is recorded and the walk continues rather than costing the other nineteen. The rate is reported against tokens actually scanned, never against all tokens — including Solana entries the scan never applied to would halve the apparent rate and argue against a change on the strength of tokens nobody looked at.

Four tests cover the arithmetic, which is load-bearing on the deferred decision: wrong numbers here would argue for the wrong answer convincingly. The walk itself needs live RPC and runs in CI.

**Completeness tests for the privileged-function table.** `metadata-mutability` had no entry, so that capability could never produce a gap and nothing said so. Entries added, and a test now requires every capability to be either scanned for or explicitly declared out of scope on EVM — a missing one fails rather than disappears. Two further tests assert signatures are canonical (a stray space or a `uint` alias hashes to a selector matching nothing) and that no two signatures collide.

**Tests that hold the documents to the code.** `METHODOLOGY.md` must mention every capability and describe `dictionaryGaps` and `gapScan`; `LIMITATIONS.md` must no longer claim an undetected admin pattern is wholly invisible, while still admitting the residual gap. Both documents were briefly wrong after the feature landed, because the code gained an ability the prose still said it lacked. A document that overstates a blind spot is as misleading as one that hides it.

### Changed

**CI now runs on every branch**, not only `main`. Five commits reached this release and only the first was ever tested: with `push` limited to `main`, the rest depended entirely on the `pull_request` event firing, and it did not. Added `workflow_dispatch` for forcing a run without an empty commit, and a commit-keyed concurrency group so the push and pull-request events for one commit collapse into a single run.

**`METHODOLOGY.md` §6 now documents what happens when we did not know to look**, and §10 records an open question rather than burying it: should a dictionary gap reduce coverage? It currently does not, and the argument that it should has not been dismissed — it is deferred until the scan has run against the registry seed set on mainnet, so the call is made on real gap counts instead of a guess.

**`Observation.value` and the two `Disagreement` value fields are now optional keys** rather than required keys typed to include `undefined`. This is what was always true on the wire: `JSON.stringify` drops an `undefined`, so an observation meaning "we could not look" arrives with the key absent. Both forms parse, and neither is `ABSENT`. No runtime behaviour changed.

---

## 0.1.3, 2026-08-05

Review follow-up. The unassessed-axis fix in 0.1.1 was correct in the two places a human looks and absent from the one a machine reads.

### Fixed

**An unassessed axis still reported a flat 0 to every machine consumer.** 0.1.1 taught the CLI and the dashboard to print `n/a` when `coverage.scored` is 0, but it did that inside the two render functions. `GET /api/score` and `safegate score --json` hand the raw score object to somebody else's code, and that object was unchanged: `"value": 0`, which is the best score the model can produce, on an axis that was never checked. The distinction existed only for readers who happened to be looking at our own output.

`AxisResult` now carries `assessed`, false when nothing on the axis resolved. The CLI and the dashboard read that field instead of each re-deriving the condition, so the rule lives in the scorer with the rest of the methodology rather than in two renderers that can drift apart.

This is the same reasoning that keeps `incident` a literal rather than a number. The axes cannot take that route without breaking the score shape, so they carry the distinction beside the value instead.

**Both lockfiles were still at 0.1.0**, left behind by the 0.1.1 version bump and not caught by 0.1.2. The root lockfile additionally recorded `AGPL-3.0-only` while `LICENSE` and `NOTICE` say Apache-2.0. Regenerated; the repository is Apache-2.0 throughout.

### Added

**Two tests.** One serialises a score and asserts `assessed` survives the round trip, because a marker that exists only in memory does not help an integrator. The other asserts that an axis holding one resolved `ABSENT` is assessed with value 0 while an axis holding only `UNKNOWN` is not, since those two cases print the same number and must never render the same way.

### Compatibility

`assessed` is additive. No existing field changed shape or meaning, so consumers need no migration, but anything reading `axes.*.value` without checking coverage was already wrong and should now read `assessed` first.

---

## 0.1.2, 2026-07-26

Completes the deployment fix. 0.1.1 got the data into the bundle but still looked for it in the wrong place.

### Fixed

**The data directories were located from `import.meta.url`.** A bundler inlines that as a literal build-time path, so the deployed function looked under the build machine's checkout directory, which does not exist at runtime. The traced files were present at the deployment root the whole time.

Added `src/data-root.ts`, which searches for `patterns/` and `registry/` across candidate roots: `SAFEGATE_DATA_ROOT` if set, then the working directory and its ancestors, then module-relative paths. The working directory comes first because that is the deployment root where output tracing places included files. Module-relative still works for local runs, the CLI and tests. Each candidate is confirmed by checking for a known subdirectory rather than assumed.

On failure the error names every path tried, the working directory, and the override variable, so a future occurrence is diagnosable from one log line.

### Added

**Two tests for runtime data location.** They copy the data to a temporary directory, change the working directory to it, and assert the resolver finds it there. A local run cannot otherwise distinguish the deployed layout from the development one, because on a dev machine the working directory and the module path happen to agree.

There is deliberately no test for "data missing everywhere". Run from inside the repository, the module-relative fallback correctly finds the real directories, which is what local runs depend on. The loud-failure path is covered by the existing data availability tests, which pass an explicit base directory.

### Notes

`outputFileTracingIncludes` from 0.1.1 is still required. Both parts were needed: the files have to be in the bundle, and the lookup has to point at where they land.

---

## 0.1.1, 2026-07-26

Fixes a deployment fault that served empty data, and the code defects that let it pass unnoticed.

### Fixed

**Data files were missing from the deployed bundle.** The engine reads `patterns/` and `registry/` from disk at request time, on paths built from `import.meta.url`. Next's file tracing cannot see those statically, so the JSON was absent from the serverless output. Added `outputFileTracingIncludes` to `apps/web/next.config.mjs`. The globs resolve from `apps/web` rather than from `outputFileTracingRoot`, so they need a `../../` prefix to reach the repo root.

**Both loaders swallowed a missing directory.** `loadPatterns` and `loadRegistry` wrapped `readdir` in `catch { continue }`, so `ENOENT` produced an empty array and a successful response instead of an error. They now throw `PatternLoadError` or `RegistryLoadError`, naming the directory and the likely cause, and also throw when a directory is readable but holds nothing usable.

This is the failure that mattered. With no patterns loaded there are no signals at all, so every axis reported 0 and every route returned 200. Zero on every axis is the best-looking result the product can produce, which means a packaging fault rendered as a clean bill of health. The rule the scorer applies to token capabilities, that absence is never safety, was not being applied to the tool's own data.

**An axis with nothing resolved reported 0.** Arithmetically correct and misleading, since it is indistinguishable from an axis that was checked and found clean. The CLI and the dashboard now show `n/a` and "nothing resolved on this axis" when `coverage.scored` is 0. This also affected valid tokens: UNI has no transparency-capability patterns and was showing a green 0.

**A data-loading fault returned 502 as a chain read failure.** `/api/score` now returns 503 and identifies it as server data being unavailable, which is what it is.

### Added

**`apps/web/scripts/verify-trace.mjs`**, run automatically after `next build`. It reads the trace manifests under `.next/server/app` and fails if the routes that reach the engine do not carry every pattern and registry file. Neither `next build` nor `next start` catches this class of fault, because both run against the local filesystem.

**Six tests covering data availability.** The suite runs on a real filesystem and so could not see this, which is why it passed while production was broken. The loaders now accept an optional base directory, and the new tests point them at missing and empty directories and assert they throw. One asserts the error text names the likely deployment cause.

**CI now builds the web app** and runs `verify-trace`.

---

## 0.1.0, 2026-07-26

First release. Methodology 0.1.0.

### Added

**Scoring engine.** Three axes, Control, Transparency and Exit, each 0 to 100 where higher is worse. Axes never collapse into a single number. `src/scoring/model2.ts` is a pure function: no network, no filesystem, no clock, no randomness, so the same inputs always produce byte-identical output.

**Tri-state signals.** `PRESENT`, `EXPECTED`, `ABSENT`, `UNKNOWN`. There is no way to express "missing, therefore fine". `UNKNOWN` is excluded from the axis calculation and reduces the coverage figure instead.

**Coverage on every score.** Reported per axis and overall. Below 60 percent, a warning is prepended telling the reader to read the unresolved signals rather than the numbers.

**Pattern dictionary**, `patterns/`, 14 entries. Each says where to read one capability on one contract shape: which storage slot, which selector, which account field. Pure data, no judgement, validated against `patterns/schema.json`.

- EVM: `proxy-eip1967`, `proxy-zeppelinos`, `proxy-uups`, `proxy-beacon`, `proxy-admin-slot`, `admin-ownable`, `admin-minter`, `admin-accesscontrol`, `admin-timelock`, `transfer-pausable`
- Solana: `spl-mint-authority`, `spl-freeze-authority`, `spl-update-authority`, `token2022-extensions`

**Registry**, `registry/`, 20 entries across Ethereum and Solana. Records which capabilities are expected for a specific address, with evidence, a named approver and an expiry date. Every address was verified against mainnet RPC before its entry was written.

**Sources.** Ethereum and Solana read directly over public RPC with endpoint failover. GoPlus and RugCheck corroborate. No API keys required.

**Source disagreement recording.** Reading the chain ourselves gives a source that overlaps with both third parties. Where readings conflict, both values are shown and the capability is reported unresolved rather than silently decided.

**Unverified reference values.** Solana holder concentration is `UNKNOWN` from our own reading, because the public RPC rate limits the call required. A third-party figure can be shown beside it under explicit attribution, outside the score.

**Incident axis** reported as the literal `insufficient-data`. Detecting what has already gone wrong needs transaction history these sources do not provide, and a bare `0` would read as "no incidents, therefore safe".

**CLI.** `safegate score <chain> <address>`. There is no flag that prints only a number: axes, coverage, reasoning and limitations always travel together.

**Validator.** `npm run validate` enforces the contribution rules mechanically: two evidence kinds minimum per registry entry, substantive justifications, no duplicate addresses, mandatory disclosure field.

**Web dashboard**, `apps/web/`, Next.js 15 and React 19 on port 3100. Lookup, registry browser, pattern browser, methodology, limitations and disclosure. `GET /api/score?chain=&address=` returns the full score object with no field-selection parameter.

The methodology weights, the standing limitations and the disclosure table are read from the engine and the registry at render time, so those pages cannot drift from the code they describe.

**Test suite.** 15 regression tests against live RPC endpoints, including locks on the two documented false negatives below.

**DCO sign-off** required on contributions, `git commit -s`. Provenance only: it assigns no copyright and grants no relicensing rights.

### Notes

Two cases in the dictionary exist because reading a chain naively gets them wrong, and both are locked in the test suite:

- **USDC on Ethereum is upgradeable.** The standard EIP-1967 implementation slot reads zero. It uses the older zeppelinos slot, where the implementation is `0x43506849d7c04f9138d1a2050bbf3a0c054402dd`.
- **UNI has a live mint authority.** `owner()` reverts, which reads as renounced. The admin is `minter()`, at `0x1a9c8182c09f50c8318d769245bea52c32be35bc`.

Verified on Solana: USDC and USDT carry active mint *and* freeze authority; JitoSOL, mSOL and ORCA carry mint but not freeze. A liquid staking token must mint on deposit to function at all, which is why a blanket "mint authority is dangerous" rule produces false positives on legitimate tokens, and why the registry exists.

### Licence

Apache-2.0, whole repository. Commercial and closed-source use permitted. Retain `NOTICE` and state your changes.
