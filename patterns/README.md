# patterns/

The dictionary. A pattern answers one question: given a contract of this shape, where do I look to find out whether it has this capability? Which storage slot, which selector, which account field, which Token-2022 extension.

Patterns are data. They say where to look and how to read the bytes. Whether the answer is good or bad is decided once, in `signals/` and `registry/`.

## Why it exists

Reading a chain directly is not simple. USDC on Ethereum reads as not upgradeable through the EIP-1967 slot; it uses the older zeppelinos slot. UNI's `owner()` reverts, which reads as renounced; its admin is `minter()`. WETH9 answers every selector with empty data, which read as "every function exists" until 0.2.0. Knowing which slot, which selector, for which shape is what commercial scanners accumulated privately. Publishing it is the point.

## Why patterns beat tokens

| | One entry per | Grows with |
|---|---|---|
| `registry/` | address | how many tokens we vouch for |
| `patterns/` | contract shape | how many ways contracts get written |

Thousands of ERC-20s share one `Ownable` shape, so one file reads all of them.

## Adding one

1. Copy the closest existing file.
2. It must validate against `schema.json` and `npm run validate`, and its `method.kind` must carry the field that kind reads.
3. `coversExamples` needs at least one real mainnet address you verified, with the date. Do not write down a reading you did not make.
4. `rationale`: what breaks without it.
5. `knownFalseNegative`: when relying on it alone misleads.

See `../CONTRIBUTING.md` for the review bar.

## An unread shape is never "safe"

A capability no pattern reads on a chain resolves `UNKNOWN` and costs coverage. The gap scan reports privileged functions and extensions the dictionary cannot read as `dictionaryGaps`. Neither ever resolves to absent.
