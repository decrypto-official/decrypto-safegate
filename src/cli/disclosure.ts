#!/usr/bin/env node
/**
 * Generates DISCLOSURE.md from the registry, or checks that the committed file
 * matches what the registry would generate.
 *
 *   npm run disclosure            rewrite DISCLOSURE.md
 *   npm run disclosure -- --check exit 1 if DISCLOSURE.md is stale
 *
 * GOVERNANCE.md says disclosure is generated, not hand-maintained. Before
 * 0.2.0 nothing generated it: the file said 20 entries while the registry
 * held 21. The check runs in CI so it cannot drift again.
 *
 * The "as of" date is the newest verifiedAt in the registry, not the wall
 * clock, so regenerating on an unchanged registry produces an identical file.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRegistry, type RegistryEntry } from '../registry/lookup.js';
import { findDataDir } from '../data-root.js';

export function renderDisclosure(entries: RegistryEntry[]): string {
  const byChain = (chain: string) => entries.filter((e) => e.chain === chain);
  const withRelationship = entries.filter((e) => e.commercialRelationship !== null);
  const asOf = entries.map((e) => e.verifiedAt).sort().at(-1) ?? 'NA';

  const row = (label: string, list: RegistryEntry[]) =>
    `| ${label} | ${list.length} | ${list.filter((e) => e.commercialRelationship !== null).length} |`;

  const relationships =
    withRelationship.length === 0
      ? `**No commercial relationship is declared with any issuer in the registry.** Every entry carries \`commercialRelationship: null\`. Declared, not audited: this file can only show what the registry records.`
      : [
          `**${withRelationship.length} entr${withRelationship.length === 1 ? 'y' : 'ies'} declare a commercial relationship.**`,
          '',
          '| Token | Chain | Relationship |',
          '|---|---|---|',
          ...withRelationship.map((e) => `| ${e.symbol} (${e.id}) | ${e.chain} | ${e.commercialRelationship} |`),
        ].join('\n');

  return `# Disclosure

Any commercial relationship between the maintainer and an issuer rated by Safegate.

Generated from \`registry/\` by \`npm run disclosure\`. Do not edit by hand; CI fails if this file does not match the registry.

## Registry as of ${asOf}

${relationships}

| Chain | Entries | With a declared relationship |
|---|---|---|
${row('Ethereum', byChain('ethereum'))}
${row('Solana', byChain('solana'))}
${row('**Total**', entries)}

## The rule

Decrypto, which publishes Safegate, has commercial interests in crypto. No payment is accepted from a token issuer for anything that touches a rating: no paid placement, no paid rating, no expedited registry review. Any other commercial relationship with an issuer is declared in that token's registry entry and appears here and on the token's page.

## How this stays honest

- The methodology and weights are published and the scorer is a pure function. A number a stranger can recompute cannot be bent by payment.
- There is no manual score, no override, and no allow-list outside the published methodology. Adding one would be a visible code change.
- \`commercialRelationship\` is a required field on every registry entry. Hiding a relationship means deleting a field, which shows in review and in git history.
- This file is generated and checked in CI.

See [GOVERNANCE.md](GOVERNANCE.md) for decision rights and disputes.

## Reporting a suspected undisclosed relationship

Open a public GitHub issue. A conflict-of-interest allegation handled in private is worthless as a control.
`;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const entries = await loadRegistry();
  const expected = renderDisclosure(entries);
  const repoRoot = join(await findDataDir('registry'), '..');
  const target = join(repoRoot, 'DISCLOSURE.md');

  if (check) {
    let current = '';
    try {
      current = await readFile(target, 'utf8');
    } catch {
      current = '';
    }
    if (current !== expected) {
      console.error(`DISCLOSURE.md does not match the registry. Run: npm run disclosure`);
      process.exit(1);
    }
    console.log('DISCLOSURE.md matches the registry');
    return;
  }

  await writeFile(target, expected, 'utf8');
  console.log(`wrote ${target} from ${entries.length} registry entries`);
}

main().catch((err) => {
  console.error(`disclosure failed: ${(err as Error).message}`);
  process.exit(1);
});
