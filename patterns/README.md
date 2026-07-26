# patterns/

The dictionary. **This is the most valuable directory in the repository.**

A pattern answers one question: *given a contract of this shape, where do I look to find out whether it has this capability?* Which storage slot. Which function selector. Which account field.

Patterns are pure data. They say where to look and how to read the bytes. They never say whether the answer is good or bad. That judgement happens later, in `signals/` and `registry/`, and it happens once, in one place.

## Why this directory exists at all

Reading a blockchain directly sounds like it should be simple and authoritative. It is neither. Two cases on major tokens:

**USDC looks like it is not a proxy.** Read the standard EIP-1967 implementation slot on `0xa0b8...eb48` and you get zero. A naive reader concludes "not upgradeable". That is wrong. USDC uses the older zeppelinos slot, and reading `0x7050c9e0...f8c3` returns implementation `0x43506849d7c04f9138d1a2050bbf3a0c054402dd`. It is upgradeable, and the most widely held stablecoin in crypto would have been scored on a false premise.

**UNI looks like it has no owner.** Call `owner()` on `0x1f98...F984` and it reverts. A naive reader concludes "renounced, therefore safe". That is wrong. UNI has no owner because its admin lives behind `minter()`, which returns `0x1a9c8182c09f50c8318d769245bea52c32be35bc`. A live mint authority would have been reported as renounced.

Neither mistake is exotic. Both are on the most-traded tokens in the market. The knowledge of which slot and which selector, for which contract shape, is exactly what commercial scanners accumulated privately over years and never published.

Publishing it is the point of this project.

## Why patterns scale better than tokens

| | One entry per | Grows with |
|---|---|---|
| `registry/` | token or address | how many tokens we vouch for |
| `patterns/` | contract shape | how many ways contracts get written |

Thousands of ERC-20s share one `Ownable` shape, so one `admin-ownable.json` reads all of them. The registry grows linearly with ambition. The dictionary grows logarithmically with reality.

That is why a contributor can add real value with a single small JSON file, and why this directory is maintainable by a small team.

## Adding a pattern

1. Copy the closest existing file and edit it.
2. Every file must validate against `schema.json`. CI enforces this.
3. `coversExamples` must contain at least one **real, verified** mainnet address, with the date you checked it. These become regression fixtures, so a pattern that stops working fails the test suite.
4. Fill `rationale` with what breaks if the pattern is absent.
5. If relying on this pattern alone can give a wrong answer, say so in `knownFalseNegative`. That field is not an admission of weakness. It is the most useful field in the file.

See `../CONTRIBUTING.md` for the review bar.

## An unknown shape is never "safe"

If no pattern matches a contract, the capability resolves to `UNKNOWN` and the token's coverage figure drops. It never resolves to "absent" and never to "good". A gap in this dictionary must be visible in the output, not silently forgiving.
