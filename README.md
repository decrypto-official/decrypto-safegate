# Decrypto Safegate

An open, reproducible way to read what a crypto token can do to you.

Safegate reads a token's structure directly from the chain, scores it on three axes, and always says how much of the token it could check. Every score can be recomputed by a stranger from public inputs.

Ethereum and Solana. A pattern dictionary, a reviewed registry, a CLI and a dashboard. `npm run validate` prints the current pattern and registry counts. Methodology 0.2.0; changes are in [UPDATE.md](UPDATE.md).

## Why

Every tool that rates tokens has the same problem: the people publishing the rating have a commercial interest in the thing being rated, and their method is closed. "Trust us" cannot be verified from outside.

The fix is reproducibility. If anyone can take public inputs, apply a published method, and get the same score, no commercial relationship can bend a number a stranger can recompute. This repository is the method, the data, and the code.

## One example

Solana USDC has an active mint authority and an active freeze authority. On most scanners those are the two scariest flags a token can carry. USDC is also the safest token in this registry. Both are true: a regulated issuer must mint against reserves and must be able to freeze on lawful order.

Captured from the CLI on 2026-09-06:

```
USDC (USD Coin)  solana EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
registry: fiat-stablecoin  verified 2026-07-22 by decrypto

AXES (higher is worse)
  control       ....................   0   4/4 checks resolved
  transparency  #################### 100   1/1 checks resolved
  exit          ....................   0   2/2 checks resolved

COVERAGE      100% (7 of 7 applicable checks resolved)
INCIDENT      insufficient-data

SIGNALS
  [PRESENT ] metadata-mutability [transparency]
      Metadata mutability is present (2wmVCSfPxG..., via spl-update-authority).
      No registry entry justifies it for this token.
  [EXPECTED] freeze-authority [control]
      Freeze authority is present (7dGbd2QZcC..., via spl-freeze-authority), and
      the registry records it as expected for this token. Legally required. US
      permitted stablecoin issuers must retain the ability to freeze and seize
      on lawful order. ... An expected capability is still a capability: the
      holder can use it.
  [ABSENT  ] transfer-restriction [exit]
      Transfer restriction cannot be present: the legacy Token program has no
      mechanism for transfer restriction; its whole privileged surface is mint
      authority and freeze authority, both of which were read.
```

It does not say "safe". It says which capabilities exist, which are justified and by whom, what it could not check, and what it cannot know. The transparency 100 is real and explained in [METHODOLOGY.md](METHODOLOGY.md) §3: metadata mutability is the only transparency capability, so it decides that axis alone.

## Getting started

```bash
npm install
npm run safegate -- score solana EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
npm run safegate -- score ethereum 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
npm test              # offline
npm run test:live     # reads mainnet
```

No API keys. Both chains are read through free public RPC endpoints. An address that holds no token (a wallet, an empty address, a Solana holder account) is refused rather than scored.

## How it works

```
sources/    read the chain. nothing else is a source yet.
patterns/   the dictionary: which slot, selector, field or extension, for which shape.
signals/    PRESENT | EXPECTED | ABSENT | UNKNOWN. absence is never safety.
registry/   which capabilities are expected, for which address, with evidence.
scoring/    a pure function. same inputs, same bytes.
```

Three axes, each 0 to 100, higher is worse, never combined into one number:

| Axis | The question |
|---|---|
| Control | How much do I have to trust them not to act against me? |
| Transparency | How much can I check for myself? |
| Exit | If this goes bad, can I get out? |

Two rules shape everything. **Absence is never safety**: what we could not check is `UNKNOWN`, costs coverage, and never counts as clean. **A bare score is not obtainable**: axes, coverage, reasoning and limitations always travel together, in the API and the CLI.

## Why the dictionary matters

USDC on Ethereum reads as not upgradeable through the standard EIP-1967 slot; it uses the older zeppelinos slot. UNI's `owner()` reverts, which reads as renounced; its admin is `minter()`. WETH9 answers every function selector with empty data, which read as "every function exists" until 0.2.0. Knowing which slot and which selector, for which contract shape, is what commercial scanners accumulated privately. Publishing it is the point, and every case above is locked in the test suite.

Where no pattern reads a capability, the score says so and the coverage figure drops. Where a contract exposes a privileged function the dictionary cannot read, it is reported as a `dictionaryGaps` entry, never folded into the score.

## What it cannot do

Read [LIMITATIONS.md](LIMITATIONS.md) before relying on anything here. Short version: structural, not predictive. It cannot see team intent, custody, private agreements or unlock schedules, and it cannot tell you whether a token will rug.

## Contributing

`patterns/` and `registry/` are plain JSON and carry most of the value. The bar is high on purpose. See [CONTRIBUTING.md](CONTRIBUTING.md) and [GOVERNANCE.md](GOVERNANCE.md).

## Disclosure

Safegate is published by Decrypto, which has commercial interests in crypto. Any commercial relationship with a rated issuer is recorded in the registry, generated into [DISCLOSURE.md](DISCLOSURE.md), and checked in CI.

## Licence

[Apache-2.0](LICENSE), the whole repository: code, dictionary, registry, docs. Use it, fork it, build a paid product on it. Keep the `NOTICE` file and state your changes; a score computed against a modified registry is not comparable to one computed against this one.
