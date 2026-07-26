#!/usr/bin/env node
/**
 * Validates patterns/ and registry/ against the contribution rules.
 *
 * This is the CONTRIBUTING.md bar, enforced by a machine. A standard that is
 * only written down is a standard that erodes the first time someone is in a
 * hurry, and the registry is the part people have to trust.
 *
 * Run in CI on every pull request.
 */

import { z } from 'zod';
import { loadPatterns } from '../patterns/resolve.js';
import { loadRegistry } from '../registry/lookup.js';

const CAPABILITIES = [
  'upgradeability', 'mint-authority', 'freeze-authority', 'admin-authority',
  'metadata-mutability', 'transfer-restriction', 'fee-control',
] as const;

const patternSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  chainFamily: z.enum(['evm', 'solana']),
  capability: z.enum(CAPABILITIES),
  method: z.object({
    kind: z.enum(['storage-slot', 'call-selector', 'account-field']),
    storageSlot: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
    callSelector: z.string().regex(/^0x[0-9a-fA-F]{8}$/).optional(),
    accountField: z.string().optional(),
    returnType: z.string(),
  }),
  detects: z.string().min(10),
  presenceIndicatedBy: z.enum(['non-empty-value', 'call-success']).optional(),
  // Required, and required to be substantive. "adds coverage" is not a rationale.
  rationale: z.string().min(40, 'rationale must explain what breaks without this pattern'),
  coversExamples: z.array(z.object({
    chain: z.string(), address: z.string(), symbol: z.string(),
    observed: z.string().optional(), verifiedAt: z.string().optional(),
  })).min(1, 'at least one real verified mainnet address is required'),
  addedAt: z.string(),
}).passthrough();

const registrySchema = z.object({
  id: z.string(),
  chain: z.enum(['ethereum', 'solana']),
  address: z.string().min(20),
  symbol: z.string(),
  archetype: z.string(),
  expectedCapabilities: z.array(z.object({
    capability: z.enum(CAPABILITIES),
    justification: z.string().min(30, 'justification must explain why the token needs this capability'),
    constrainedBy: z.string().optional(),
  })),
  evidence: z.array(z.object({
    kind: z.enum(['onchain', 'documentation', 'whitepaper', 'regulatory-filing', 'audit', 'public-statement']),
    detail: z.string().min(10),
  }).passthrough()).min(2, 'at least two evidence items are required'),
  // Required, never optional. Omitting a disclosure must take deliberate action.
  commercialRelationship: z.string().nullable(),
  verifiedAt: z.string(),
  approvedBy: z.string().min(1),
}).passthrough();

async function main(): Promise<void> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const patterns = await loadPatterns();
  for (const pattern of patterns) {
    const parsed = patternSchema.safeParse(pattern);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`pattern ${pattern.id}: ${issue.path.join('.')} ${issue.message}`);
      }
    }
    if (!pattern.knownFalseNegative) {
      warnings.push(`pattern ${pattern.id}: no knownFalseNegative. If relying on it alone can mislead, say so.`);
    }
  }

  const registry = await loadRegistry();
  const seen = new Map<string, string>();

  for (const entry of registry) {
    const parsed = registrySchema.safeParse(entry);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`registry ${entry.id}: ${issue.path.join('.')} ${issue.message}`);
      }
    }

    // Two evidence items of the SAME kind do not corroborate each other.
    const kinds = new Set(entry.evidence.map((e) => e.kind));
    if (kinds.size < 2) {
      errors.push(`registry ${entry.id}: evidence must span at least two kinds, found only ${[...kinds].join(', ')}`);
    }

    // Two entries claiming the same address would make lookup order significant.
    const key = `${entry.chain}:${entry.address.toLowerCase()}`;
    const previous = seen.get(key);
    if (previous) errors.push(`registry ${entry.id}: duplicate address, already claimed by ${previous}`);
    seen.set(key, entry.id);

    if (!entry.caveats || entry.caveats.length === 0) {
      warnings.push(`registry ${entry.id}: no caveats. Every entry must say what it does NOT mean.`);
    }

    if (!entry.reviewDue) {
      warnings.push(`registry ${entry.id}: no reviewDue. Entries should expire.`);
    } else if (new Date(entry.reviewDue) < new Date()) {
      warnings.push(`registry ${entry.id}: review overdue since ${entry.reviewDue}. No longer grants EXPECTED status.`);
    }
  }

  const disclosed = registry.filter((e) => e.commercialRelationship !== null);

  console.log(`\npatterns   ${patterns.length} loaded`);
  console.log(`registry   ${registry.length} entries (${registry.filter(e => e.chain === 'ethereum').length} ethereum, ${registry.filter(e => e.chain === 'solana').length} solana)`);
  console.log(`disclosure ${disclosed.length} entries with a commercial relationship`);

  if (warnings.length > 0) {
    console.log(`\nwarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (errors.length > 0) {
    console.log(`\nerrors (${errors.length}):`);
    for (const e of errors) console.log(`  x ${e}`);
    console.log('');
    process.exit(1);
  }

  console.log('\nall checks passed\n');
}

main().catch((err) => {
  console.error(`validate failed: ${(err as Error).message}`);
  process.exit(1);
});
