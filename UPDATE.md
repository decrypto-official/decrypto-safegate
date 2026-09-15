# Update log

Newest first. Each entry carries a date, a version, and what changed.

Versions follow [semver](https://semver.org). Since the score is the product:

- **major**: a breaking change to the score shape or to what a score means
- **minor**: new patterns, new registry entries, new capability coverage
- **patch**: bug fixes, docs, tooling

The methodology carries its own version in `METHODOLOGY.md`, currently 0.3.0. Any change to weights, the capability-to-axis mapping, or the formula bumps that too, and must publish which scores move as a result.

Grouped under **Added / Changed / Fixed / Removed**, following [Keep a Changelog](https://keepachangelog.com).

---

## 0.7.0, 2026-09-15

What the 0.6.0 reading was actually worth, measured. 0.6.0 licensed a scored `ABSENT` on a 52-token scan and a list of eight spellings, and said in METHODOLOGY §7 and LIMITATIONS §5 that the list could not be proved complete. A 400-token sweep found it incomplete within a day, including two live mainnet tokens publishing `cannot be present` about metadata their own bytecode can rewrite.

No weight, axis mapping or formula changed. The methodology version stays 0.3.0: the rule is the same rule, the list it reads against is longer.

### Fixed

**Two tokens published a verified clean absence that was false.** OFC (`0x9cb7a4ef…`) dispatches `setTokenURI(string)` and PANDORA (`0x9e9fbde7…`) dispatches `setNameSymbol(string,string)` and `setTokenURI(string)`. Both have fixed bytecode, so 0.6.0 read metadata mutability ABSENT, scored transparency 0 at 7 of 7 coverage, and reported no gap at all. Both now read UNKNOWN at 6 of 7 with the setter in `dictionaryGaps`. A second sweep over a fresh sample found the same failure on ROBO and IMD via `updateNameAndSymbol(string,string)` and `updateName`/`updateSymbol`.

**The list was being extended four spellings at a time, and was not converging.** Two independent 400-token samples each produced spellings nobody had written down. So the whole watchlist the sweep had been carrying is now in the table rather than beside it. For licensing an absence the widest list is strictly safest: a signature no contract dispatches costs one line, and a missing one costs a published "cannot be present" on a token whose name can be rewritten. Entries are still limited to names that unambiguously mean metadata; a generic numeric setter could be anything and stays on the watchlist.

The metadata list goes from 8 signatures to 54. What that bought, on a fresh 400-token sample: 12 tokens carrying a mutator, all 12 caught, **0 false clean readings**.

### Added

**`npm run sweep`.** The list cannot be proved complete, so it is measured instead. The command samples tokens from recent mainnet blocks by call frequency, filtered to ERC-20 shape — our own reading, not a third-party token list — and scans each one's whole dispatch surface against the shipped table plus a watchlist of spellings nobody has adopted. A watchlist entry that fires is the finding, and earns its place in the table. Like the census it is a measuring instrument and never a gate: it exits 0 whatever it finds.

```
npm run sweep                    150 blocks, up to 400 tokens
npm run sweep -- --blocks 300    look further back
npm run sweep -- --json          machine-readable, for diffing across runs
```

**`docs/samples/metadata-sweep-2026-09.json`**, both runs, before and after, with every hit.

### Which scores move

Only tokens that carry a metadata-mutating function under one of the 46 newly adopted spellings, and only those whose bytecode is fixed. On the 400-token sample that is 4 tokens, each moving the same way:

| Tokens | 0.6.0 | 0.7.0 | Why |
|---|---|---|---|
| OFC, PANDORA, ROBO, IMD | transparency **0**, 7/7, no gap | transparency **n/a**, 6/7, setter reported as a gap | the spelling is in the table now, so the absence is refused |
| every other token sampled | unchanged | unchanged | no reading, hash or value changed |

This is a coverage and transparency regression on those four, and it is the correct direction: 6 of 7 with the gap named is the honest reading, and 7 of 7 with transparency 0 was not. No control or exit value moves anywhere. No Solana reading changes. Snapshot hashes are unaffected — the table feeds gap reporting and the absence rule, neither of which is in the hash.

### Not done

The list is longer, not complete, and nothing here can make it complete. Two samples each yielded new spellings; a third probably will too. What changed is that finding out is now one command instead of a research project, and LIMITATIONS §5 says plainly that the staleness rate is not zero and not known.

The transparency axis still rests on one capability. Third-party corroboration is still not wired.

---

## 0.6.0, 2026-09-14

The transparency axis becomes readable on Ethereum. Until now `metadata-mutability` was its only capability, no EVM pattern read it, and every Ethereum token published an n/a transparency axis at 6 of 7 coverage: a third of the output blank on the larger chain. Methodology 0.3.0.

Every number below comes from scoring the registry seed set and the 40-token launch-week sample on 0.5.1 and on this version, live, the same day, plus two rebasing tokens that are in neither set.

### Added

**Two EVM patterns for derived balances.** `meta-scaled-balance` reads `scaledTotalSupply()` and `meta-share-balance` reads `getTotalShares()`, both as `call-success`: the getter answering proves the contract computes balances from a factor rather than storing them, so what a wallet displays moves without a transfer. This is the capability Token-2022 calls `scaledUiAmountConfig`, which the Solana side has mapped to `metadata-mutability` since 0.2.0; Ethereum now reads the same thing under the same name. Verified on AMPL and Aave's aEthUSDC for the first, stETH for the second, with USDC, UNI and WETH9 as negatives.

Neither pattern claims more than it reads, and both say so in `knownFalseNegative`: an aToken's factor is the pool's liquidity index and moves with market interest, AMPL's is set by a monetary-policy contract, and only a Token-2022 mint has a literal authority who can set the multiplier at will. All three make the displayed number derived, which is what the transparency axis asks about. Only the last is a power one address holds.

**`metadata-mutability` can now read ABSENT on Ethereum.** Where a contract's bytecode is fixed and dispatches none of the metadata-mutating selectors the table names, there is nothing on it that can rewrite its metadata and nothing can be added. Both conditions are required: a proxy, an `upgradeTo` in the bytecode, or any positive upgradeability reading leaves the capability UNKNOWN, because code that can be replaced can grow a setter tomorrow. So does a bytecode read that failed, since a surface with a hole in it looks exactly like a surface with nothing on it.

The finding behind this: a scan of all 52 Ethereum tokens in the seed set and the sample, following proxies through both the EIP-1967 and zeppelinos slots, found **not one** exposing `setName`, `setSymbol`, `setNameAndSymbol`, `setTokenInformation`, `setBaseURI`, `setTokenURI` or `setContractURI`. There was no Ethereum metadata setter to write a pattern for. The scan's controls found USDT's `setParams`, WBTC's `mintingFinished`, BAYC's `setBaseURI`, and USDC's implementation behind the zeppelinos slot, so the null is a null and not a broken scan.

**Five metadata spellings in the privileged-function table**, plus `rebase(uint256,int256)`. The table is now doing two jobs: it reports gaps, and it is the list the absence above is an absence of. Those are deliberately the same list, derived in code rather than written twice, so a spelling added to one tightens both.

### Fixed

**A call-success `uint256` read as a truncated address.** `summarise` rendered any non-zero word as its first eight hex digits, so AMPL's gon supply came out as "currently 0xffffffff...", which tells a reader nothing and looks like an address. A `uint256` now prints as a number: in full below 10^15, in exponential above it. USDT's fee switch reads "currently 0" instead of "currently false/zero".

### Which scores move

Seed set and sample, 0.5.1 to 0.6.0, 52 Ethereum tokens and 9 Solana tokens.

| Tokens | 0.5.1 | 0.6.0 | Why |
|---|---|---|---|
| 48 of the 52 Ethereum | transparency n/a, 6/7 | transparency **0**, **7/7** | metadata mutability UNKNOWN to ABSENT: fixed bytecode, no setter dispatched |
| AAVE, USDC, H, PRD | transparency n/a, 6/7 | unchanged | proxied, so the absence is refused and the capability stays UNKNOWN |
| all 9 Solana | unchanged | unchanged | no Solana reading, hash or value changed |

**No control value and no exit value moves on any token, and no gap list changes.** The only axis affected is transparency, and where it became assessed it reads 0 on every one of the 52 — none of them is a rebasing token. The positives live outside both sets:

| Token | control | transparency | exit | coverage | via |
|---|---|---|---|---|---|
| AMPL | 44 | 100 | 0 | 7/7 | `meta-scaled-balance` |
| stETH | 0 | 100 | 0 | 7/7 | `meta-share-balance` |

The snapshot hash moves on all 52 Ethereum tokens, because every one of them now carries the two new probe observations. On the two that answer a `call-success` `uint256` getter it moves for a second reason as well: USDT's fee switch now records "currently 0" and ENS's capped schedule "currently 1667336117", where both previously recorded eight hex digits. No Solana hash moves. Scores published under 0.2.0 still verify against themselves: `safegate verify` recomputes a file's hash from that file's own observations, and marks axes as not checkable across methodology versions rather than comparing them against the wrong formula.

### Not done

**The transparency axis still rests on one capability**, and that is still the real fix. It is now readable on both chains rather than one, which was the blocker; a second capability is the next question, and nothing here answers it.

The ABSENT reading is **weaker than the Solana legacy-mint absence it is modelled on**, and METHODOLOGY §7 says so where a reader will meet it. Solana's rests on a program that has no such mechanism; this one rests on our list of setter spellings being complete, which cannot be proved. A setter under a name nobody has catalogued reads as a clean absence rather than as a gap. That is the same residual the gap scan has always declared, with the difference that it now moves an axis instead of only being reported, which is why the list is derived from the gap table rather than kept beside it.

Third-party corroboration is still not wired. Ethereum still has no pattern for fee control beyond Tether's and the launchpad template's.

---

## 0.5.1, 2026-09-06

The patch review of 0.3.0 through 0.5.0. Text and guards; no score, hash or pattern changes.

### Fixed

**METHODOLOGY named `mintingFinished()` as the example for `capability-absent`.** No shipped pattern uses that inversion, and `mint-oz-mintable` deliberately scores on the getter existing because WBTC's flag can never be trusted. The sentence now says so.

**`capability-absent` under `call-success` was accepted and could never fire.** The read is the function existing, so there is no value to invert and the pattern would read absent every time. Refused by the validator and at load, with a test. CONTRIBUTING rule 7 says it.

**Reasoning carried the return type.** "owner() returns (address) answered the zero address" is now "owner() answered the zero address"; on Solana "freezeAuthority is not set" no longer repeats "not set" in the same sentence.

**The 0.4.1 entry claimed the version-tag fix that shipped in 0.3.0.** Removed.

**The state-chip explanation could be cut off on narrow screens.** It opens below the chip under 900px.

**The web package still said 0.1.8.** Both package files carry the release number from now on.

---

## 0.5.0, 2026-09-06

What a sample of launch-week tokens taught. Every number here comes from scoring the registry seed set and a sample of 40 actively traded Ethereum tokens created in the 90 days before 2026-09-06, on 0.4.0 and on this version, live, the same day. The sample and its per-token results before and after are in `docs/samples/launch-week-2026-09.json`.

### Fixed

**The gap list cried wolf.** On the sample, 13 of the 14 gaps reported were `transferOwnership` on a token whose `owner()` had answered the zero address, or `burnFrom`. The first is the canonical renouncement: the getter answered, and the write function can never pass its check again. The second is OpenZeppelin's allowance-gated `burnFrom`, which anyone can call on funds approved to them, not a power held over anyone. `burnFrom` left the table. A write function whose own getter answered a definite nothing is explained rather than reported (`transferOwnership` and `setOwner` after `owner()` zero). After: no token in the sample reports either.

**"Not found" hid two facts.** `owner()` answering the zero address and `minter()` reverting both became "checked N patterns and none located it". Every observation now records how its read resolved, `answered`, `missing` or `unavailable`, and the reasoning says which: "Admin authority is not set: owner() answered the zero address: unset or renounced, via admin-ownable" against "Mint authority was not found". A zero storage slot is `missing`, not answered: a storage read always returns a word, so zero there cannot tell unset from unused. The field is not in the snapshot hash and older scores still verify.

**The one live blacklist was missed.** KITE has a live owner, `setBlacklisted(address,bool)` in its bytecode and a `blacklisted(address)` getter, and read freeze ABSENT with no gap. `freeze-blacklisted` reads that third spelling. KITE moves from control 22 to 50.

### Added

**The launchpad template's surface, in the gap table.** 14 of the 40 carry a fee, limit and trading-gate surface (`updateBuyFees`, `enableTrading`, `removeLimits`, `updateMaxWalletAmount` and their kin) that neither the dictionary nor the table knew. 25 signatures added under fee-control, transfer-restriction, freeze-authority and mint-authority. When ownership is renounced and no other admin mechanism was found, every reported function says so: an owner-gated setter is then dead, and the modifier cannot be read from bytecode. It does not say so on MKR, whose Ownable owner is zero while its DSAuth authority is live.

**`fee-launchpad-buy-total` and `fee-launchpad-sell-total`.** Read `buyTotalFees()` and `sellTotalFees()` as values: 0 is absent, above 0 is present with the rate. Five of the 40 share the template byte for byte; all answer 0 with ownership renounced, and read "Fee control is not set" with the setters listed as dead if owner-gated. A `uint256` getter answering 0 now reads as absent everywhere; before, only an empty word did.

**Three live locks** (KITE, SHRUB, UNI) and ten offline tests.

### Which scores move

Seed set, 0.4.0 to 0.5.0: no axis value moves on any of the 21 tokens. MKR reports `mint(uint256)` as a second gap; it has that function.

Sample of 40, 0.4.0 to 0.5.0. Control / exit; coverage is 6/7 on every token in both.

| Tokens | 0.4.0 | 0.5.0 | Why |
|---|---|---|---|
| KITE | 22 / 58, freeze ABSENT, no gap | 50 / 58, freeze PRESENT | `blacklisted(address)` read |
| SHRUB, $1, CATE, RIZO, MAGACHAN | 0 / 0, one gap each (`transferOwnership` or `burnFrom`) | 0 / 0, seven gaps each, all marked dead if owner-gated | template setters in the table; renouncement explained |
| X, FLOCK, STEOST | two gaps each | one, `mint(address,uint256)` | `burnFrom` and `transferOwnership` no longer listed |
| KLIK, OUTBURN (0xa5a6…), ACAT, PRISM | one gap each | none | same |
| OUTBURN (0x1431…) | none | `removeLimits`, `enableTrading` | template setters in the table |
| the other 26 | unchanged | unchanged | |

Tokens reporting at least one gap: 14 before, 11 after. Distinct gap signatures reported: three before, two of them noise; nine after, every one a setter or a mint.

No weight, axis mapping or formula changed. The methodology version stays 0.2.0.

### Not done

The template's `tradingActive()`, `limitsInEffect()` and `maxWallet()` getters could read transfer restriction as a value the same way. Not done: on every template token in the sample trading is open and limits are off, so the sample offers no case of the pattern firing, and a pattern with no verified positive is a guess. Metadata mutability on Ethereum stays UNKNOWN.

---

## 0.4.2, 2026-09-06

### Added

**`safegate verify <score.json> [--live]`.** METHODOLOGY §10 has said since the first version that any score can be recomputed by a stranger from public inputs. No command did it. This one takes a published score and, from the file alone, recomputes the snapshot hash from its observations and the axes, coverage and limitations from its signals, then reports byte-identical or which field did not follow. Key order does not matter. A score computed under another methodology version has its hash checked and its axes marked as not checkable across versions rather than compared against the wrong formula. `--live` reads the chain again and lists the observations that read differently now, as information about the token rather than a failure of the score. Exit 1 on any failed check; `-` reads stdin. Five offline tests cover the scorer's own output, a reordered file, an edited number, an edited observation, a non-score and a version mismatch.

---

## 0.4.1, 2026-09-06

The dashboard moves. No score, pattern or registry entry changes; the engine is untouched.

### Changed

**Every clickable region says so.** Nav items, example cards, registry and pattern rows and the address all take one hover treatment: the surface lifts, a 1px accent box appears, and where there is room a corner label says what the click does. Focus gets the same look, so the keyboard sees what the mouse sees. The nav's accent rail slides in on hover and stays on the current page.

**Figures draw in once on first paint.** Meter bars rise from 0, the coverage ring draws from 0, the radar grows from its centre, and the axis values and the coverage percentage count up over 400ms with their denominators static beside them. Panels and signal records enter in sequence, 30ms apart. A new result remounts the view so it draws again. `prefers-reduced-motion` skips all of it, delays included.

**State chips explain themselves.** Hovering or focusing PRESENT, EXPECTED, ABSENT or UNKNOWN shows one line on what the state means. The reasoning under each signal stays visible regardless.

**A read line while the chain is being read.** A 2px accent sweep under the topbar, gone the moment the result or the error lands.

**The topbar reads the data.** Pattern and registry counts come from the files on disk through the same loaders the scorer uses, NA if they cannot be read.

**The home page fills the width.** The introduction and the four example tokens sit side by side; each example is a card with the reason it is worth a click. Once a lookup has run, the examples shrink to a row of chips under the form.

**Instrument texture.** A faint dot grid on the content ground and 1px corner ticks on every panel. Nothing moves, glows or loops.

**The address copies on click**, and says so for a second.

**Design document amended.** DESIGN.md §6 excluded number tickers; it now allows a single first-paint draw-in with the denominator static, and §7 allows 400ms for draw-ins. Recorded as a divergence in `globals.css`. No animation library was added.

---

## 0.4.0, 2026-09-06

One pattern. USDC's mint authority on Ethereum is read instead of reported as a gap.

### Added

**`mint-master-minter`.** Reads `masterMinter()`, the address in Circle's FiatToken contract that appoints minters and sets their allowances. The three mint patterns looked for `minter()`, `mintingFinished()` and a capped schedule; Circle's contract has none, so the registry's flagship token read as unable to mint while its entry expected the capability. Verified 2026-09-06: USDC answers `0xe982615d461dd5cd06575bbea87624fda4e3de17` and `minter()` reverts; EURC answers `0x02398771fd1db790ef2b656ca3bcb3075f27a72c`; USDT and WBTC revert; WETH returns empty data, which the 0.2.0 rule reads as not present. USDC's registry entry records the reading. One live lock.

### Which scores move

Measured 2026-09-06 with `npm run seed-scores` on 0.3.0 and on 0.4.0.

| Token | 0.3.0 | 0.4.0 | Why |
|---|---|---|---|
| USDC (Ethereum) | 0 / n/a / 0, one gap | 0 / n/a / 0, no gaps | mint authority reads EXPECTED instead of ABSENT; the registry justifies it, so the value does not move |
| everything else | unchanged | unchanged | mint authority now checks four patterns on Ethereum instead of three |

No weight, axis mapping or formula changed. The methodology version stays 0.2.0.

---

## 0.3.0, 2026-09-06

The gap scan reads a proxy's implementation, Ethereum has its first fee-control pattern, and the dashboard's version tag reads the scorer instead of a string. Every number in this entry comes from running the seed set on 0.2.0 and on this version, on mainnet, on the same day.

### Fixed

**The gap scan stopped at the proxy.** A proxy's own bytecode dispatches its upgrade functions and nothing else; every privileged function lives in the implementation. The scan read only the proxy, so for every proxied token `dictionaryGaps` was empty by construction while the documents called the scan a second line of defence. It now reads the implementation too, from the address the proxy slot holds, and each gap names the contract it was found on. Measured 2026-09-06: USDC's implementation dispatches `mint(address,uint256)`, which no pattern reads, and USDC's mint authority reads ABSENT while the registry expects it. That was silent on 0.2.0 and is a reported gap now. PAXG, not in the registry, dispatches `mint(address,uint256)` and `freeze(address)` on its implementation with both capabilities reading ABSENT; on 0.2.0 it reported no gaps.

**The dashboard said methodology 0.1.0.** The sidebar tag was a string. It now reads `METHODOLOGY_VERSION` from the scorer.

**The dashboard's weight note for metadata mutability said it "fires on RAY, JUP and BONK" and is "near enough ignored".** METHODOLOGY §3 has said the opposite since 0.2.0. The page now says what the document says.

### Added

**`fee-tether-basis-points`.** Reads `basisPointsRate()` on Tether's contract; the getter answering means the fee switch is built in, whatever the rate is today. Verified 2026-09-06: `basisPointsRate()` and `maximumFee()` both answer 0 on USDT, and `setParams(uint256,uint256)` is in the bytecode. The other eleven Ethereum seed tokens were checked the same day against 26 fee getters and setters, on the proxy and the implementation where there is one, and carry none. PAXG's current implementation carries no fee function either. `setParams` joins the gap scanner's table.

**`method.pointsTo: implementation`.** A pattern field marking a storage slot whose address is the contract whose code runs behind the token. Set on `proxy-eip1967` and `proxy-zeppelinos`. The validator and the loader refuse it on any read that is not a storage slot returning an address. The beacon slot holds the beacon, not the code, and is not followed.

**Two live locks**, PAXG's implementation gaps and USDT's fee switch, and offline tests for the implementation scan and the address collection.

### Changed

**Every Ethereum token reads 6 of 7.** Fee control is read on Ethereum now, so it no longer costs coverage. Metadata mutability is the one capability still UNKNOWN on Ethereum, by decision: none of the twelve seed tokens dispatches a name, symbol or URI setter, checked 2026-09-06 against 17 such signatures, and ERC-20 metadata otherwise changes only through an upgrade, which is already scored. A pattern here would turn UNKNOWN into ABSENT and read nothing.

**A gap scan that could not read the implementation is `failed`, not `ran`.** What was read is still reported, and the limitation text says the read was partial.

### Which scores move

Measured 2026-09-06 with `npm run seed-scores` on 0.2.0 and on 0.3.0. Axis values are control / transparency / exit; n/a means unassessed.

| Token | 0.2.0 | 0.3.0 | Coverage | Why |
|---|---|---|---|---|
| USDT (Ethereum) | 0 / n/a / 0 | 0 / n/a / 42 | 5/7 → 6/7 | fee switch read as present, and not expected |
| USDC (Ethereum) | 0 / n/a / 0 | 0 / n/a / 0 | 5/7 → 6/7 | values unchanged; `mint(address,uint256)` on the implementation is now a reported gap |
| AAVE, CRV, MKR | 22, 28, 22 / n/a / 0 | 22, 28, 22 / n/a / 0 | 5/7 → 6/7 | fee control read as absent |
| DAI, ENS, LDO, LINK, UNI, WBTC, WETH | 0 / n/a / 0 | 0 / n/a / 0 | 5/7 → 6/7 | same |
| all nine Solana tokens | unchanged | unchanged | 7/7 | nothing here touches Solana |

No weight, axis mapping or formula changed. The methodology version stays 0.2.0.

### Not done

USDC's mint authority on Ethereum still reads ABSENT. Circle's design has no pattern: verified 2026-09-06, `masterMinter()` answers `0xe982615d461dd5cd06575bbea87624fda4e3de17` and `minter()` reverts. It is a reported gap now, and a pattern for it is the next change. Metadata mutability on Ethereum stays UNKNOWN, above. Third-party corroboration is still not wired. The dashboard design is unchanged; that is the next PR.

---

## 0.2.0, 2026-09-06

Methodology 0.2.0. Every capability is now in every score's denominator, three readings that were wrong on the seed set are fixed, the Metaplex metadata account is read, and two claims the documents made about the code were not true and are now either true or removed. Every number in this entry comes from running the seed set on 0.1.8 and on this version, on mainnet, on the same day.

### Fixed

**An address with no contract scored 0 on every axis at full coverage.** Every probe on an empty address reads "checked, nothing there". `analyse` now reads the code first and refuses a wallet, an unused address, an EIP-7702-delegated wallet, a missing Solana account, and a Solana account that is not a mint. The API returns 404 with the reason.

**A throttled endpoint turned probes into verified absences.** `ethCall` treated every JSON-RPC error carrying a code as a revert. Rate limits, timeouts and method-not-found all carry codes. Only code 3 and messages containing "revert" are reverts now; anything else fails over and, if every endpoint fails, becomes UNKNOWN.

**WETH scored exit 100 with a pause mechanism it does not have.** WETH9's fallback is `deposit()`, so it answers every selector with empty data, and every `call-success` probe read that as the function existing. It also reported a `mintingFinished()` it does not have. Empty return data now reads as "function not present". Verified by `eth_call` on 2026-09-06: `paused()`, `mintingFinished()`, `nextMint()` and a random selector all return `0x` on WETH.

**`admin-accesscontrol` could never fire.** It called `hasRole(bytes32,address)` with no arguments, which always reverts. Every AccessControl token read as having no admin. It now calls `DEFAULT_ADMIN_ROLE()`. Verified on GHO on 2026-09-06: the old call reverts, the new one answers.

**Metadata mutability was UNKNOWN on every Solana token.** The pipeline never fetched the Metaplex account. It now derives the metadata PDA and parses the account (dependency: `@noble/curves` for the ed25519 curve check, `@scure/base` for base58). Verified against mainnet: the USDC mint derives to `5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq`, owned by the Metaplex program, name "USD Coin", mutable.

**`nonEmptyMeans: capability-absent` did nothing.** The schema and every pattern declared it; no code read it. Implemented.

**A pattern missing its method field vanished silently.** `kind: storage-slot` without `storageSlot` produced no observation. Refused at load and by the validator.

**The snapshot hash was not recomputable.** Ethereum hashed the observation list; Solana hashed three fields that omitted two patterns. Both chains now hash the canonical observation list, documented in METHODOLOGY §10.

**The coverage warning said "two thirds" and applied at 60%.**

**Three claims the documents made were false.** GoPlus and RugCheck corroboration was described in four places and exists nowhere in `src/`. DISCLOSURE.md said "generated, do not edit by hand" and was hand-written; it said 20 entries while the registry held 21. METHODOLOGY said metadata mutability "fires on RAY, JUP and BONK" when it could not fire on anything. The first is now described as designed and not wired. The second is generated by `npm run disclosure` and checked in CI. The third is true as of this version.

### Added

**Freeze authority on Ethereum.** Two patterns read the blacklist getters, `isBlacklisted(address)` (USDC) and `isBlackListed(address)` (USDT), through a new `method.callArgs` field for view functions that need a fixed dummy argument. Both verified on 2026-09-06. The USDC and USDT registry entries now expect `freeze-authority`, with the same lawful-order justification their `transfer-restriction` entries already carried. The gap scanner's `blacklist(address)`, `addBlackList(address)` and `blockAccount(address)` moved from `transfer-restriction` to `freeze-authority` to match.

**`npm run disclosure` and `npm run disclosure:check`.** Generates DISCLOSURE.md from the registry, dated from the newest `verifiedAt` rather than the clock so an unchanged registry produces an identical file. CI fails on drift.

**`npm run seed-scores`.** Scores every registry token and prints a table or JSON. This is how the table below was produced, and how the next methodology change will produce its own.

**`test/unit.test.ts`.** Offline coverage of error classification, code classification, the empty-data rule, `callArgs`, `nonEmptyMeans`, the missing-capability fill, the snapshot hash, symbol decoding, the Metaplex reader, the scorer's warning text, registry expiry, and disclosure generation.

**Seven live locks** for the readings above: WETH, USDC freeze, GHO admin, the dead address, a Solana holder account, RAY metadata, and USDC on Solana's structural absences.

**`live.yml`.** Live regression locks, the census and the seed-set scores run nightly and on demand. `ci.yml` is offline and runs on Node 20 and 22.

### Changed

**Every capability is applicable on every chain.** A capability no pattern reads on a chain is emitted as UNKNOWN, with that reason in the signal, and counts against coverage. Before, it was absent from the score entirely, so an Ethereum token reported 4 of 4 when the dictionary could see 4 of 7. Ethereum has no pattern for fee control or metadata mutability, so every Ethereum token now reads at most 5 of 7 until someone contributes those patterns.

**Extension-only capabilities on a legacy Solana mint are verified ABSENT.** The legacy Token program has no mechanism for fees, transfer hooks, permanent delegates, mint closing or confidential transfers; its whole privileged surface is the two authorities the dictionary reads. The reasoning says so. 0.1.8 dropped these observations; dropping them left the exit axis unassessed on every legacy token.

**Weights are documented as relative.** METHODOLOGY §3 now states that `metadata-mutability`, alone on the transparency axis, decides that axis outright regardless of its weight of 1. Every Solana token in the registry has mutable Metaplex metadata, so every one now reads transparency 100. That is what the formula produces and the document no longer implies otherwise. Adding more transparency capabilities is the follow-up.

**Live tests are opt-in.** `npm test` runs offline. `npm run test:live` sets `SAFEGATE_LIVE=1`.

**Documents shortened.** README, METHODOLOGY, LIMITATIONS, GOVERNANCE, CONTRIBUTING and patterns/README say the same rules in roughly half the words.

### Which scores move

Measured 2026-09-06 with `npm run seed-scores` on 0.1.8 and on 0.2.0. Axis values are control / transparency / exit; n/a means unassessed.

| Token | 0.1.8 | 0.2.0 | Coverage | Why |
|---|---|---|---|---|
| AAVE | 31 / n/a / 0 | 22 / n/a / 0 | 4/4 → 5/7 | freeze read as absent, diluting control |
| CRV | 38 / n/a / 0 | 28 / n/a / 0 | 4/4 → 5/7 | same |
| MKR | 31 / n/a / 0 | 22 / n/a / 0 | 4/4 → 5/7 | same |
| WETH | 0 / n/a / 100 | 0 / n/a / 0 | 4/4 → 5/7 | fallback no longer read as a pause mechanism |
| DAI, ENS, LDO, LINK, UNI, USDC, USDT, WBTC | 0 / n/a / 0 | 0 / n/a / 0 | 4/4 → 5/7 | unchanged values, honest denominator |
| JitoSOL, JUP, mSOL, ORCA, PYTH, RAY, USDC, USDT (Solana) | 0 / n/a / n/a | 0 / 100 / 0 | 2/3 → 7/7 | metadata read (mutable on all eight); extension-only capabilities verified absent |
| PYUSD | 44 / 100 / 100 | 44 / 100 / 100 | 7/7 → 7/7 | unchanged |

No weight, axis mapping or formula changed. What changed is the denominator, and three readings that were wrong.

### Not done

Third-party corroboration is still not wired. Ethereum still has no pattern for fee control or metadata mutability. The transparency axis still rests on one capability. The dashboard's design is unchanged in this release.

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
