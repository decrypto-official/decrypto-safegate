# Update log

Newest first. Each entry carries a date, a version, and what changed.

Versions follow [semver](https://semver.org). Since the score is the product:

- **major**: a breaking change to the score shape or to what a score means
- **minor**: new patterns, new registry entries, new capability coverage
- **patch**: bug fixes, docs, tooling

The methodology carries its own version in `METHODOLOGY.md`, currently 0.1.0. Any change to weights, the capability-to-axis mapping, or the formula bumps that too, and must publish which scores move as a result.

Grouped under **Added / Changed / Fixed / Removed**, following [Keep a Changelog](https://keepachangelog.com).

---

## 0.1.8, 2026-09-02

Token-2022 is read properly. This closes a live false negative on the most severe capability in the SPL ecosystem, and it gives the census a Solana surface, so the gap scan now covers 20 of 20 registry tokens instead of 12.

Published scores move for the eight Solana tokens in the registry. See **Which scores move** below.

### Fixed

**A permanent delegate was invisible, and a fee mechanism was reported in its place.** The dictionary held one pattern for the whole of Token-2022, matching the entire extension array to `fee-control`. On a mint carrying a `permanentDelegate` — a single address able to transfer or burn **any holder's balance, at any time, with no action or consent from that holder** — Safegate reported a transfer fee and said nothing at all about the delegate.

PYUSD is the case that makes this concrete. It carries eight extensions, all with the same authority. Safegate reported one capability: fee control, at a rate of **0 basis points**. The reader was told the least severe true thing about the token while the most severe one stayed unmentioned. It now reports seven capabilities, each read from its own extension.

**The reasoning string rendered `[object Object]`.** The single pattern matched an array, and the array went into the sentence shown to the reader — eight times over on PYUSD.

**A Token-2022 read on a legacy mint claimed a verified absence.** The old pattern's field path resolved to nothing on a legacy Token mint, which the resolver recorded as "we checked and it is not there" rather than "there is nothing here to check". Every legacy Solana token therefore reported `fee-control` as **ABSENT** — and since one definite miss outweighs any number of could-not-looks, that single false reading was enough to score the whole exit axis as a clean 0. Eight tokens were claiming an axis they had never been assessed on.

### Added

**Seven Token-2022 patterns**, one per extension, replacing the single catch-all. Each reads the authority named in that extension rather than inferring one from the array's existence: `permanentDelegate`, `mintCloseAuthority`, `transferHook`, `transferFeeConfig`, `confidentialTransferMint`, `metadataPointer`, `tokenMetadata`. Every one is verified against a real mainnet mint.

Two of the mappings are worth stating outright, because both were arrived at against a first instinct:

- **`mintCloseAuthority` is upgradeability, not administration.** Closing a mint requires zero supply, which looks like a constraint and is not an independent one when the same key also holds the permanent delegate: burning the supply and then closing the mint is one actor's sequence. The address can then be re-initialised as a *different token with different rules*, and every wallet, price feed and integrator keys off that address. That is upgradeability in the most literal sense available on Solana.
- **`transferFeeConfig` is PRESENT at 0 basis points.** The authority is a separate field from the rate, and the ceiling is 100% of the transfer. Scoring the current rate rather than the authority would report a token whose owner can take the entirety of every transfer as having no fee control at all. The two-epoch delay before a new rate takes effect is reported as a mitigating detail, never as an absence. The same reasoning covers `transferHook` with a null `programId` — with the difference, noted in the pattern, that installing a hook takes effect immediately and has no delay at all.

**PYUSD, the registry's first Token-2022 entry.** Seeded because without it the whole Token-2022 path is dead code in CI: the eight Solana entries that preceded it all use the legacy program, so every pattern here and the Solana gap scan would have passed vacuously — the same failure as a regression lock that asserts nothing.

The entry records **two** expected capabilities, mint and freeze, and deliberately justifies nothing else. One keypair on this mint holds nine authorities — freeze, permanent delegate, mint close, both transfer-fee authorities, transfer hook, metadata pointer, metadata update and confidential transfer — with no timelock, no threshold and no on-chain governance. It is a plain system-owned account, not a program or a multisig. The mint authority *is* a multisig, and it requires one of four signers, of which that same keypair is one.

Both powers the entry does justify have been used. Fourteen freeze actions are recorded against this mint and thirteen accounts are frozen; the permanent delegate was used once in production, moving 450,030.24 PYUSD out of a third party's account in a single instruction signed by that one key. The transaction signature is in the entry so a reader can check it rather than take our word for it. No individual PYUSD freeze or seizure appears to have been publicly announced, although the issuer did announce a comparable PAXG freeze in 2022.

**Transfer restriction is deliberately not marked expected, and that is the entry's most consequential judgement.** The permanent delegate is documented in the issuer's own white paper as "critical for regulatory purposes" and would qualify on its own. But the transfer hook authority resolves the same capability and is, again in the issuer's words, "initialized for potential future use" — so marking the capability expected would stretch a legal justification for seizure over an unexplained power to run arbitrary code on every transfer. The registry works at capability granularity and the evidence here is finer than that; where the two disagree, the entry justifies less rather than more.

**A gap scan for Solana**, the counterpart of the bytecode scan and a firmer one. Bytecode says a contract *could* dispatch a function; a mint's extension list says it *is configured to*, now, with each authority named in the account. The limitation text and the CLI and dashboard headlines say which of the two they are describing, rather than sharing a sentence that would understate one or overstate the other.

**An extension nobody has classified is reported with no capability named.** Token-2022 gains extension types regularly, and an allowlist that silently skips what it does not recognise would guarantee that the newest power on a mint is the one we miss — this project's own absence-is-never-safety rule, broken in the instrument built to enforce it. The same applies to `unparseableExtension`, the node's own marker for data it could not decode. Both are reported as unread rather than resolved into a guess.

### Changed

**A legacy Token mint counts as scanned, not as inapplicable.** Its entire privileged surface is `mintAuthority` and `freezeAuthority`, both of which the dictionary reads. "We scanned it and nothing is unread" is true, and is a stronger statement than declining to look. The census covers 20 of 20 registry tokens as a result, where it previously covered 12 and reported the other 8 as out of scope.

**A Token-2022 pattern makes no finding at all about a legacy mint.** Neither available answer was honest. Recording a value would claim a check that could not have found anything. Recording "could not look" would add a capability to the coverage denominator that the mint could never have scored, making every legacy token appear less covered purely because the dictionary learned about a program it does not use. The observation is not emitted.

### Which scores move

All eight Solana registry tokens — USDC, USDT, JitoSOL, mSOL, ORCA, RAY, JUP, PYTH — move identically, and in one direction only:

| | before | after |
|---|---|---|
| Exit axis | `0` (assessed) | `n/a` (unassessed) |
| Coverage | 3 of 4 | 2 of 3 |
| Gap scan | `not-applicable` | `ran`, no gaps |

No axis value rises and none falls. The exit axis stops reporting a clean `0` that rested entirely on the false `fee-control` absence described above. Nothing on Ethereum moves.

No weights, no axis mapping and no formula changed. `METHODOLOGY_VERSION` stays `0.1.0`.

---

## 0.1.7, 2026-09-02

The tail of the 0.1.6 pass, which merged before it was finished, plus the guide. Presentation and documentation only: no scoring code, no pattern or registry data, no published score moves.

### Added

**A guide, at `/guide`.** The dashboard assumed its reader already knew what minting, a proxy or an admin key was. Someone who does not is exactly the person the tool is for, and they were the only audience with nothing to read.

It explains the screen top to bottom, defines every term it uses in plain words, and walks three real tokens: USDC, where three capabilities are expected and still real; MKR, whose administrator is invisible to the obvious check; and WBTC, whose "stop minting" function was overridden to do nothing, so trusting the flag gives the opposite of the truth.

It is a page in the app rather than a document beside it, because the vocabulary it defines is the vocabulary on screen two clicks away, and because a second copy is a second thing to drift. Print styles are part of it, so the browser saves a clean PDF from the same source.

Nothing countable is typed into it. The pattern count is read from the dictionary at build time, and four tests hold the prose to the code: it must explain every signal state the scorer can emit, name every axis, teach both of the distinctions the product exists to make, and count the dictionary rather than assert a number. When a capability or a state is added, the suite fails until the guide catches up — a guide that quietly falls behind is wrong with the authority of documentation, and its reader is the least equipped to notice.

**Two figures.** Coverage is a ring, never drawn without its denominator, and deliberately not coloured by value — banding it would turn a measure of how much was read into a verdict on what was found. The three axes are a radar with the labelled bars beneath it, because a three-point radar alone shows a silhouette rather than a value.

An unassessed axis is not plotted at all. At the origin it landed on the same pixel as a genuine zero, which is exactly the confusion the hatched meter track exists to prevent, reintroduced in the figure; its spoke is dashed and labelled `n/a` instead. Each assessed point carries its own value as text, so severity is never encoded by colour alone — the amber and green in use measure ΔE 7.7 under protanopia, below the 8 floor, and a reader with that form of colour blindness cannot separate them.

Both are hand-drawn SVG, roughly forty lines each. A ring is one circle with a dash offset and a three-point radar is three points at fixed angles; a charting library earns its weight through generality that a fixed shape cannot use.

### Fixed

**The separator between signal records never rendered.** `.table tbody tr:last-child td` out-specified `.signals .reason-cell`, and every record's second row is its own tbody's last row, so the rule meant to keep records apart was overridden on every one of them — merging the findings list into the single grey block that separator exists to prevent. The generic rule now excludes `.signals`.

**The central caveat disappeared on phones.** "Not a safety rating" was set to truncate with an ellipsis and then to `display: none` below 640px, so it was clipped at medium widths and gone entirely on the devices least able to spare it. The topbar grows to fit it.

**`role="button"` on a `<tr>` broke the table it was meant to make accessible.** It overrides the implicit row role, so cells stop being cells, column headers are discarded, and the row collapses into one flat button label — undoing the semantics that were the reason for keeping a table. The lists are `role="grid"`, which legitimises a focusable, selectable row, and rows carry `aria-selected`.

**The capability column still could not fit `upgradeability`.** Removing `overflowWrap` stopped it breaking mid-word, but the `<col>` was a fixed 116px under `table-layout: fixed`, so the word spilled into the next column instead. It is 150px.

**`--text-faint` sat within 4% of `--text-dim`,** collapsing two secondary tiers into one grey. It is `#7c8798`, a visible step apart and still clear of the contrast floor at 5.51/5.19/4.79. `--text-dim` returns to `#8a97ad`, which measured 6.78/6.39/5.90 and never needed changing; 0.1.6's entry describes a `#9fabc0` that is now reverted.

**`Figures.tsx` set `fontSize` inline at 11 and 10px,** breaking both rules 0.1.6 introduced: no inline pixel sizes, and nothing below 12px. The 10px case was the `n/a` marker on an unassessed axis.

### Changed

**Density returns to the internal spec.** Row height, panel padding, topbar height, sidebar width and the prose measure had each been loosened by a few pixels; they are back to the specified rhythm. Density and illegibility are separable, and only the latter was the complaint — so the tight rhythm is kept exactly and only the bottom of the type scale moves, where labels were being set at 10 and 11px in the faintest grey in the palette.

**The signals list is a table again.** 0.1.6 replaced it with a list of articles to fix a real problem — a multi-sentence paragraph crushed into the fifth column of five — and lost the scoped headers doing it. Two rows per record satisfies both: the scannable fields stay a real table, and the reasoning spans the full width beneath at prose measure, always visible. Capability names render lowercase; as a row header they were inheriting the uppercase treatment of the column headers, which made the page disagree with the identifiers it was describing.

### Removed

**`coveragePct`,** dead once the ring took over the calculation.


---

## 0.1.6, 2026-09-02

A readability and accessibility pass on the web app. No scoring code was touched, no pattern or registry data changed, and no published score moves.

### Fixed

**Three places where the interface made the mistake the product exists to prevent.** These were found by design review and are not cosmetic.

An **unassessed axis wore the same amber as a resolved score**. `--unknown` means "we could not check this", and it was also the colour for a middling number, so Transparency resolving nothing and Control scoring 50 read as the same severity band. The meter track made it worse: an unassessed axis rendered an empty track, and an empty track is pixel-identical to a fill of width zero, so Exit genuinely scoring 0 and Transparency knowing nothing looked the same in the element carrying the most visual weight per axis. Anyone scanning bars rather than numbers could not tell "confirmed clear" from "we know nothing". `n/a` is now neutral, and an unread track is hatched.

**Coverage was a traffic light** — green above 80, amber above 60, red below — on a figure whose own caption one line down says it is not a safety measure. Cropped to its own panel it produced a green "75%" badge, which is precisely the compact verdict card `ScoreResult`'s docstring says the product refuses to offer. It is now neutral, and no longer the largest text on the page.

**The registry page reported 0 commercial ties in `--absent` green**, the colour meaning "we checked and it is not there". Zero declared ties can only honestly mean none were declared, not that none exist. `PageHeader`'s `tone` prop existed solely to paint counts in state colours and has been removed; the figure now reads "declared, not audited".

**Accessibility defects.** The pattern and registry lists were mouse-only: rows carried `onClick` with no `tabIndex`, role or key handler, and those lists are the only route to any record but the first, so most of the dictionary and registry could not be reached without a mouse. Below 1024px the sidebar was `display: none` with nothing in its place, so every destination except the brand link was unreachable on a phone; a horizontal nav now occupies that row. The result view had no `h1` at all — the only one on the route lived in the pre-search intro and unmounted when a score arrived — so the token's name was not a heading and heading navigation went straight to "Axes" without announcing the subject. The findings list lost its column headers when it stopped being a table, leaving four fields distinguished only by position; they now carry visually hidden labels. Filter buttons showed their state through background colour alone and now set `aria-pressed`.

**`--text-faint` failed WCAG AA everywhere it was used.** It measured 3.26 on `--bg`, 3.07 on `--surface` and 2.83 on `--surface-raised` against a 4.5 floor, and appeared 24 times across the components at 10 and 11px for table headers, nav labels and metadata. The large-text exemption begins around 24px and applied to none of it. It is now `#8794a8` at 6.52/6.14/5.67, and `--text-dim` moves to `#9fabc0` to clear the 7:1 target GitHub sets for its dark theme. The ratios are recorded beside the tokens.

**`overflowWrap: anywhere` on the capability column** broke `upgradeability` into `upgradeabili/ty`. It breaks at any character, and that word has no hyphen to break at.

### Changed

**Body type is 14px, not 13px, and comes from a scale.** Every dense-data design system worth copying puts body text at 14px — GitHub Primer, Vercel Geist, IBM Carbon's productive set, Ant Design. Linear runs 13px, but as caption and secondary text rather than as body. Before this there were 25 hardcoded `fontSize: 11` and four `fontSize: 10` inline across the components, each chosen locally, which is why nothing lined up and why raising the base alone would have fixed nothing. All 39 are now scale tokens and no pixel size is set inline anywhere.

**The signals table is a findings list.** The density complaint was never word count: it was a five-column table whose fifth column held a multi-sentence paragraph, fitted into whatever width the four fixed columns left over, at 12px. A table asks the eye to compare values down a column, which suits state, capability and axis and does not suit prose. Scannable fields now sit on one line with the state first, so the states still form a column to run down, and the reasoning sits beneath at full prose size, line height and measure.

**Nothing was hidden to achieve that.** Reasoning and limitations stay visible without interaction. Collapsing them behind a disclosure control is exactly how a bare score becomes obtainable, and that is the one thing this product refuses to allow, so progressive disclosure was rejected here despite being the standard answer to prose in a dense UI.

**Two shapes that read as a generated interface.** Callouts were a rounded box bordered on all four sides with a tinted left edge, nested inside an already-bordered panel; they are now a flat rule against a tinted ground, which is what an aside is. The home page led with three equal-width cards under a bold question, the most recognisable shape of a generated marketing page and the first thing anyone saw; the words are unchanged and the arrangement is now a stacked list.

**The summary rail sticks.** It is short and the findings column is long, so it ran out partway down and left dead space beside the tail of the list. Keeping it on screen while the findings are read is the reason for putting them side by side.

**`globals.css` cited a `DESIGN.md` that was never committed to this repository.** The rules it referred to are written out in the stylesheet header instead, beside the code that has to obey them.

---

## 0.1.5, 2026-09-02

Acts on the first real measurement from the census 0.1.4 added. Three of the five dictionary gaps it found on mainnet are now read; the two that remain are documented as deliberate rather than pending.

### Added

**Three patterns, for the three contract shapes the census caught us missing.** The census walked the registry seed set and reported that 4 of 12 scanned EVM tokens expose a privileged function no pattern reads — DAI, MKR, WBTC and ENS, five gaps in total. These were live false negatives: each of those tokens scored as though it had no mint authority at all.

None of the five functions can be read directly, and that constraint shaped every pattern here. `applyEvmPatterns` sends a selector with no arguments, by design, so `mint(address,uint256)` and `setOwner(address)` are unreadable twice over: they take parameters, and they write state. The fix in each case is to find the zero-argument getter that betrays the same contract shape.

- **`admin-dsauth`**, reading `authority()`. The Ownable false negative in the dialect that predates Ownable. DSAuth permits a call if the caller is the owner **or** if `authority.canCall` approves it, so a token whose `owner()` is empty can still be fully administered. The census corroborated this from the other direction before the pattern existed: it flagged MKR's `setOwner(address)` precisely because `owner()` came back empty and nothing read the authority.

- **`mint-oz-mintable`**, reading `mintingFinished()`. The legacy OpenZeppelin `MintableToken` shape, where the flag exists only on a contract whose `mint` is guarded by `canMint`. WBTC is the case that makes this pattern worth reading twice: it **overrides `finishMinting()` to `return false`** with no `super` call and no assignment, so `mintingFinished` can never become true and minting is architecturally permanent. A reader that takes the flag at face value gets the opposite of the truth, which is why the pattern scores on the function existing rather than on what it returns.

- **`mint-capped-schedule`**, reading `nextMint()`. A rate-limited governance mint. ENS already resolved `admin-authority` through `owner()`, but supply and administration are different capabilities, and nothing in the dictionary read the supply side — a token that can dilute holders on a schedule was reporting no mint authority whatsoever. The pattern deliberately does not read the cap or the interval: reporting "capped at a few percent a year" as though it were a safety property is a judgement, and patterns do not make judgements.

**Six regression locks**, three live and three offline.

The live three nearly shipped broken, and the way they failed is worth recording. Written first as `expect(state).not.toBe('ABSENT')`, the WBTC and ENS locks **passed in a sandbox where every RPC endpoint returned 403** — an unreachable endpoint records `undefined`, which becomes `UNKNOWN`, and `UNKNOWN` is not `ABSENT`. A regression lock that a total network outage satisfies is not a lock. All three now name the value they expect.

The offline three lock the reasoning rather than the outcome, so they need no network: no pattern may match `mint(address,uint256)` or `setOwner(address)` as a call, both signatures stay in the privileged-function table, and every pattern added here reads through a zero-argument getter.

### Changed

**The census result, which is the point of the release.** Gaps fell from 5 to 2, and tokens carrying a gap from 4 of 12 (33%) to 2 of 12 (17%). ENS and WBTC now scan clean. MKR keeps one gap, DAI keeps one, both mint authority.

**`METHODOLOGY.md` §10 now carries real numbers** in place of the note that nobody had any. The deferred question — should a dictionary gap reduce coverage? — stays deferred, but on better evidence and with the argument stated in both directions. The rate halving once someone looked at the shapes suggests gaps largely measure dictionary coverage at a moment in time; the fact that the two survivors resist closure cuts the other way, since that is the part which will still be there after the dictionary improves. Twelve EVM tokens is too small a seed set to settle something that moves every published score.

**`LIMITATIONS.md` §5 gains a bound the project had not stated:** a detected gap is not always a closable one. Finding a gap and being able to read the capability are separate problems. DAI is both failure cases at once — `mint(address,uint256)` takes arguments, its `wards` authorisation is a mapping with no fixed slot, and the contract exposes no zero-argument admin getter of any kind — so that gap is reported on every DAI score and we have no way to close it.

**`README.md` said v0.1.2 and a 14-pattern dictionary.** Both had been true two releases earlier.

### Not done, deliberately

**DAI's mint authority and MKR's mint authority stay unread**, and both stay in the privileged-function table so the census keeps reporting them.

There was a shortcut available: treat a selector's presence in the bytecode as a reading of the capability. It would have closed all five gaps with two small files and needed no change to `findDictionaryGaps`, which already subtracts by `method.callSelector`. It was rejected, because if bytecode presence counts as a reading then every entry in the privileged-function table becomes a pattern, `findDictionaryGaps` returns nothing by construction, and the instrument that found these four tokens is deleted. That would have looked like closing the gaps while removing the ability to detect them.

The line that keeps both features meaningful: the gap scanner says *a privileged function exists and we have no reading for it*; a pattern says *we can read who holds this capability on this contract shape*. MKR's mint is gated by the DSAuth authority, which is not mint-specific — reading it as mint authority would report a mint capability on every DSAuth contract, including those with no mint function.

Where a capability cannot be read, the gap scanner is the only thing standing between it and silence. Trimming the table to make the census look clean would be the exact failure this project exists to prevent.

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
