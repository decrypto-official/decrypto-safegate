# Decrypto Safegate

An open, reproducible way to read what a crypto token can actually do to you.

Safegate reads a token's structure directly from the blockchain, scores it on three axes, and always tells you how much of the token it was able to check. Every score can be recomputed by a stranger from public inputs.

**Status: v0.1.8.** Ethereum and Solana, a 23-pattern dictionary, a 20-token registry, a CLI and a dashboard. Methodology 0.1.0. Changes are tracked in [UPDATE.md](UPDATE.md).

---

## Why this exists

Every tool that rates crypto tokens has the same structural problem: the people publishing the rating usually have some commercial interest in the thing being rated, and their method is closed. You are asked to trust that the two are unconnected.

"Trust us, we vet carefully" is an integrity promise, and integrity promises cannot be verified from outside. Every conflicted intermediary in history has made that promise sincerely, including the credit rating agencies in 2008.

The only fix that survives scrutiny is **reproducibility**. If anyone can take public inputs, apply a published method, and arrive at the same score, then no commercial relationship can bend a number a stranger can recompute. Restraint stops being something you have to take on faith.

That is what this repository is: the method, the data it runs on, and the code, all in the open.

---

## What it does, in one example

Solana USDC has an **active mint authority and an active freeze authority**. On most scanners, those are the two scariest flags a token can carry.

USDC is also the safest token in this registry.

Both are true. A regulated stablecoin issuer must be able to mint against reserves, and US permitted issuers are legally required to retain the ability to freeze and seize on lawful order. Circle has used it.

So Safegate reports:

```
USDC (USD Coin)  solana EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
registry: fiat-stablecoin  verified 2026-07-22 by decrypto

AXES (higher is worse)
  control       ....................   0   2/2 checks resolved
  transparency  .................... n/a   nothing resolved on this axis
  exit          ....................   0   1/1 checks resolved

COVERAGE      75% (3 of 4 applicable checks resolved)
INCIDENT      insufficient-data

  [EXPECTED] freeze-authority [control]
      Freeze authority is present (7dGbd2QZcC..., via spl-freeze-authority),
      and the registry records it as expected for this token. Legally required.
      US permitted stablecoin issuers must retain the ability to freeze and
      seize on lawful order. Circle has exercised this in practice.
      An expected capability is still a capability: the holder can use it.
```

Note what it does not do. It does not say "safe". It says which capabilities exist, which are justified and by whom, what it could not check, and what it cannot know.

---

## Getting started

```bash
npm install
npm run safegate -- score solana EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
npm run safegate -- score ethereum 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
npm test
```

No API keys. Both chains are read through free public RPC endpoints.

---

## How it works

```
sources/    read the chain directly. third-party APIs corroborate, never lead.
patterns/   THE DICTIONARY. which slot, which selector, for which contract shape.
signals/    tri-state GOOD | BAD | UNKNOWN. absence never becomes safety.
registry/   which capabilities are expected, for which token, with evidence.
scoring/    pure function. no I/O. same inputs always give the same output.
```

### The three axes

| Axis | The question a beginner is really asking |
|---|---|
| **Control** | How much do I have to trust them not to act against me? |
| **Transparency** | How much can I check for myself? |
| **Exit** | If this goes bad, can I get out? |

Higher is worse on every axis. They never collapse into one number. See [METHODOLOGY.md](METHODOLOGY.md).

### Two rules that shape everything

**Absence is never safety.** If we could not check something, it is `UNKNOWN` and the coverage figure drops. It never quietly counts as clean.

**A bare score is not obtainable.** Axes, coverage, reasoning and limitations always travel together, in the API and in the CLI. There is no flag that prints just a number, because a number on its own is the thing that gets screenshotted and misquoted.

---

## Why `patterns/` is the important directory

Reading a blockchain directly sounds authoritative. Done naively, it is worse than using a commercial scanner. Two cases on major tokens:

**USDC looks like it is not a proxy.** Read the standard EIP-1967 slot and you get zero. USDC actually uses the older zeppelinos slot, where the implementation is `0x43506849d7c04f9138d1a2050bbf3a0c054402dd`. A naive reader calls the most widely held stablecoin in crypto immutable.

**UNI looks like it has no owner.** `owner()` reverts, which reads as "renounced, safe". UNI's admin is behind `minter()`, at `0x1a9c8182c09f50c8318d769245bea52c32be35bc`. A naive reader clears a token with a live mint authority.

Neither is exotic. Both are among the most traded tokens in the market. Knowing which slot and which selector, for which contract shape, is exactly what commercial scanners accumulated privately and never published.

Publishing it is the point. Both cases are locked in the test suite so they cannot regress.

---

## Contributing

The two directories that need the most help are `patterns/` and `registry/`, and both are plain JSON. You do not need to read the TypeScript to add real value.

- **A pattern** teaches Safegate to read a contract shape it does not understand yet. One JSON file. Every future token of that shape becomes readable.
- **A registry entry** records that a capability is expected for a specific token, with evidence and a named approver.

The bar for merging is deliberately high, because the registry is the part people have to trust. See [CONTRIBUTING.md](CONTRIBUTING.md) and [GOVERNANCE.md](GOVERNANCE.md).

---

## What this cannot do

Read [LIMITATIONS.md](LIMITATIONS.md) before relying on anything here. The short version: this is a structural reading, not a prediction. It cannot see team intent, custody arrangements, private agreements or hidden unlock schedules, and it cannot tell you whether a token will rug.

It also cannot read every contract shape. Where a contract exposes a privileged function no pattern of ours reads, the score carries it as a `dictionaryGaps` entry — unaccounted for, not absent — and `gapScan` records whether that check ran at all. Both are reported beside the score and never folded into it.

---

## Disclosure

Safegate is published by Decrypto, which has commercial interests in crypto. Any commercial relationship with a rated issuer is declared in [DISCLOSURE.md](DISCLOSURE.md) and shown next to the affected token. [GOVERNANCE.md](GOVERNANCE.md) sets out how ratings are kept separate from any commercial activity.

---

## Licence

**[Apache-2.0](LICENSE), the whole repository.** Code, the pattern dictionary, the registry, the docs. One licence, no exceptions for the data.

Use it, fork it, embed it, build a paid product on it, put it behind an MCP server, integrate it into an exchange. Commercial and closed-source use are both fine.

Two things Apache-2.0 asks in return: keep the `NOTICE` file, and state your changes if you modified anything. The second matters more here than in most projects, because a score computed against a modified registry is not comparable to one computed against this repository's registry.

Contributions come in under the same licence. See [CONTRIBUTING.md](CONTRIBUTING.md).
