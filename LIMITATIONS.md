# Limitations

What Safegate cannot tell you. **A good Safegate score is not permission to buy anything.**

## 1. Structural, not predictive

Safegate reads what a token's code can do. It cannot predict what anyone will do with it. Nothing here predicts a rug, and anyone claiming otherwise, including anyone forking this project, is overselling it.

## 2. Off-chain risk is invisible

Team intent, custody arrangements, private agreements, unlock schedules held off-chain, compromised keys, legal exposure. These are the vectors most rug pulls use, and structural analysis is blind to all of them.

## 3. Coverage is not safety

Coverage measures our completeness, not the token's virtue. 100% means we resolved every check we know how to make. A simple token with nothing to find scores high coverage trivially.

## 4. The registry is human judgement

Entries are written and approved by people, on purpose: an automatic classifier would be gamed by anything presenting as a stablecoin. So an entry can be wrong, entries go stale (they expire for that reason), absence of an entry means nothing, and `EXPECTED` is not `SAFE`. Circle can freeze your USDC, and that is exactly what the entry says.

## 5. Patterns are always incomplete

The dictionary covers the contract shapes we know. Since 0.2.0 a capability that no pattern reads on a chain is `UNKNOWN` and costs coverage, so the gap is visible in the number. Ethereum has no pattern today for fee control or metadata mutability.

There is a second line of defence, and it is narrower than it sounds. We scan the token's privileged surface, subtract what patterns already read, and publish the rest as `dictionaryGaps`. On Ethereum that surface is the runtime bytecode matched against a table of signatures we thought to include, so a privileged function with a name we did not anticipate is invisible to the scan for the same reason it is invisible to the dictionary. **A token using an admin pattern we have never seen can still under-report its capabilities.** On Solana the surface is the mint's Token-2022 extension list, which is enumerable, so an unclassified extension is reported with no capability named. That closes the never-seen case on that surface only. A mint's relationship to any other program is outside what the extension list can tell us.

A gap is not a finding: it moves no axis and no coverage figure. And a detected gap is not always closable. DAI's mint takes arguments and its authorisation is a mapping with no fixed slot, so that gap is reported on every DAI score and we cannot close it.

## 6. Solana holder concentration is not read

The public RPC rate limits the call required. No third-party figure is fetched either. The field is declared unverified with a null value. Concentration is ambiguous even when measured: a treasury or a locker looks like a whale unless the address happens to be labelled.

## 7. What the score cannot rank

Structure only. Nothing about whether the token is a good investment, fairly priced, competently run, or whether its product works. A token can score zero on every axis and be worthless.

## 8. Third-party corroboration is not wired

The score shape carries a disagreement record for cross-checking against GoPlus and RugCheck. No such call is made in this version. Every reading is our own.

## 9. Point in time

Every score is a snapshot. An upgradeable contract can change next block. A registry entry reflects the day it was reviewed. Check `computedAt`.

## 10. Not financial advice

Safegate is an informational tool. Its publisher has commercial interests in crypto, declared in [DISCLOSURE.md](DISCLOSURE.md). Nothing here is a recommendation to buy, sell or hold anything.
