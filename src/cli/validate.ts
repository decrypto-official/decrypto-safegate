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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const CAPABILITIES = [
  'upgradeability', 'mint-authority', 'freeze-authority', 'admin-authority',
  'metadata-mutability', 'transfer-restriction', 'fee-control',
] as const;

const patternSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  chainFamily: z.enum(['evm', 'solana']),
  capability: z.enum(CAPABILITIES),
  method: z.object({
    kind: z.enum(['storage-slot', 'call-selector', 'account-field', 'account-extension']),
    storageSlot: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
    callSelector: z.string().regex(/^0x[0-9a-fA-F]{8}$/).optional(),
    callArgs: z.string().regex(/^0x([0-9a-fA-F]{64})*$/, 'callArgs must be whole 32-byte words').optional(),
    accountField: z.string().optional(),
    extension: z.string().optional(),
    extensionField: z.string().optional(),
    returnType: z.string(),
  }).refine(
    (m) => m.kind !== 'account-extension' || typeof m.extension === 'string',
    { message: 'kind=account-extension requires an extension name', path: ['extension'] }
  ).refine(
    (m) => m.kind !== 'storage-slot' || typeof m.storageSlot === 'string',
    { message: 'kind=storage-slot requires storageSlot', path: ['storageSlot'] }
  ).refine(
    (m) => m.kind !== 'call-selector' || typeof m.callSelector === 'string',
    { message: 'kind=call-selector requires callSelector', path: ['callSelector'] }
  ).refine(
    (m) => m.kind !== 'account-field' || typeof m.accountField === 'string',
    { message: 'kind=account-field requires accountField', path: ['accountField'] }
  ),
  detects: z.string().min(10),
  presenceIndicatedBy: z.enum(['non-empty-value', 'call-success', 'extension-present']).optional(),
  // Required, and required to be substantive. "adds coverage" is not a rationale.
  rationale: z.string().min(40, 'rationale must explain what breaks without this pattern'),
  coversExamples: z.array(z.object({
    chain: z.string(), address: z.string(), symbol: z.string(),
    observed: z.string().optional(), verifiedAt: z.string().regex(DATE, 'verifiedAt must be YYYY-MM-DD').optional(),
  })).min(1, 'at least one real verified mainnet address is required'),
  addedAt: z.string().regex(DATE, 'addedAt must be YYYY-MM-DD'),
}).passthrough().refine(
  (p) => !p.method.callArgs || p.presenceIndicatedBy === 'call-success',
  { message: 'callArgs requires presenceIndicatedBy: call-success; the value returned for a dummy argument means nothing', path: ['presenceIndicatedBy'] }
);

const registrySchema = z.object({
  id: z.string(),
  chain: z.enum(['ethereum', 'solana']),
  address: z.string().min(20),
  symbol: z.string(),
  name: z.string().min(1),
  issuer: z.object({ name: z.string().min(1) }).passthrough(),
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
  verifiedAt: z.string().regex(DATE, 'verifiedAt must be YYYY-MM-DD'),
  reviewDue: z.string().regex(DATE, 'reviewDue must be YYYY-MM-DD').optional(),
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
    for (const ex of pattern.coversExamples ?? []) {
      const shape = pattern.chainFamily === 'evm' ? EVM_ADDRESS : SOLANA_ADDRESS;
      if (!shape.test(ex.address)) errors.push(`pattern ${pattern.id}: example ${ex.symbol} address ${ex.address} is malformed for ${pattern.chainFamily}`);
      if (!ex.verifiedAt) warnings.push(`pattern ${pattern.id}: example ${ex.symbol} has no verifiedAt.`);
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

    const shape = entry.chain === 'ethereum' ? EVM_ADDRESS : SOLANA_ADDRESS;
    if (!shape.test(entry.address)) errors.push(`registry ${entry.id}: address ${entry.address} is malformed for ${entry.chain}`);

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
