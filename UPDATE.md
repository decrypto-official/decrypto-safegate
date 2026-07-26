# Update log

Newest first. Each entry carries a date, a version, and what changed.

Versions follow [semver](https://semver.org). Since the score is the product:

- **major**: a breaking change to the score shape or to what a score means
- **minor**: new patterns, new registry entries, new capability coverage
- **patch**: bug fixes, docs, tooling

The methodology carries its own version in `METHODOLOGY.md`, currently 0.1.0. Any change to weights, the capability-to-axis mapping, or the formula bumps that too, and must publish which scores move as a result.

Grouped under **Added / Changed / Fixed / Removed**, following [Keep a Changelog](https://keepachangelog.com).

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
