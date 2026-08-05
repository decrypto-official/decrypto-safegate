/**
 * The published shape of a Score.
 *
 * `GET /api/score` and `safegate score --json` hand this object to somebody
 * else's code. Nothing in the repository previously noticed if a field was
 * added, removed or retyped: adding `assessed` in 0.1.3 changed the contract
 * and every test still passed.
 *
 * This file is the contract, and it defends it twice.
 *
 *  1. At compile time. The two assertions at the bottom prove the schema and
 *     the `Score` interface in types.ts describe the same shape, in both
 *     directions. Add a field to one and forget the other and `tsc` fails, so
 *     the two cannot drift apart while both still look correct.
 *
 *  2. At runtime. Every object is `.strict()`, so an unexpected key is an
 *     error rather than something quietly carried along.
 *
 * There is deliberately no hand-written score.schema.json beside this. Two
 * maintained definitions of one shape drift apart, which is the exact failure
 * this file exists to prevent. zod is already how `patterns/` and `registry/`
 * are validated in src/cli/validate.ts, so this stays in that idiom.
 */

import { z } from 'zod';
import type { Score } from '../types.js';

export const capabilitySchema = z.enum([
  'upgradeability',
  'mint-authority',
  'freeze-authority',
  'admin-authority',
  'metadata-mutability',
  'transfer-restriction',
  'fee-control',
]);

export const axisSchema = z.enum(['control', 'transparency', 'exit']);
export const signalStateSchema = z.enum(['PRESENT', 'ABSENT', 'EXPECTED', 'UNKNOWN']);
export const sourceIdSchema = z.enum(['onchain', 'goplus', 'rugcheck']);
export const chainSchema = z.enum(['ethereum', 'solana']);

/**
 * `value` carries three distinguishable states and the difference is the whole
 * point of the model: a concrete reading, `null` for "looked and found
 * nothing", and absent for "could not look". JSON.stringify drops an
 * `undefined`, so after a round trip the third case arrives as a missing key
 * rather than an explicit undefined. Both forms have to parse.
 */
export const observationSchema = z
  .object({
    capability: capabilitySchema,
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    source: sourceIdSchema,
    patternId: z.string().optional(),
    method: z.string().optional(),
    observedAt: z.string(),
  })
  .strict();

export const signalSchema = z
  .object({
    capability: capabilitySchema,
    state: signalStateSchema,
    axis: axisSchema,
    observations: z.array(observationSchema),
    reasoning: z.string().min(1),
    expectedBecause: z.string().optional(),
    constrainedBy: z.string().optional(),
  })
  .strict();

export const disagreementSchema = z
  .object({
    capability: capabilitySchema,
    ours: z
      .object({ value: z.unknown(), source: sourceIdSchema, patternId: z.string().optional() })
      .strict(),
    theirs: z.object({ value: z.unknown(), source: sourceIdSchema }).strict(),
    note: z.string(),
  })
  .strict();

export const unverifiedReferenceSchema = z
  .object({
    label: z.string(),
    value: z.unknown(),
    source: sourceIdSchema,
    caveat: z.string().min(1),
  })
  .strict();

const coverageSchema = z
  .object({
    scored: z.number().int().nonnegative(),
    applicable: z.number().int().nonnegative(),
    ratio: z.number().min(0).max(1),
  })
  .strict();

export const axisResultSchema = z
  .object({
    axis: axisSchema,
    assessed: z.boolean(),
    value: z.number().min(0).max(100),
    coverage: coverageSchema,
    signals: z.array(signalSchema),
  })
  .strict();

export const dictionaryGapSchema = z
  .object({
    selector: z.string().regex(/^0x[0-9a-f]{8}$/),
    signature: z.string().min(1),
    capability: capabilitySchema,
    note: z.string().min(1),
  })
  .strict();

export const scoreSchema = z
  .object({
    chain: chainSchema,
    address: z.string(),
    symbol: z.string().optional(),
    name: z.string().optional(),

    axes: z
      .object({ control: axisResultSchema, transparency: axisResultSchema, exit: axisResultSchema })
      .strict(),

    coverage: coverageSchema,

    // Deliberately not a number. A bare 0 would read as "no incidents,
    // therefore safe", so the literal has to survive in the contract too.
    incident: z.union([z.literal('insufficient-data'), z.object({ flags: z.array(z.string()) }).strict()]),

    disagreements: z.array(disagreementSchema),
    unverified: z.array(unverifiedReferenceSchema),

    registryEntry: z
      .object({
        id: z.string(),
        archetype: z.string(),
        approvedBy: z.string(),
        verifiedAt: z.string(),
      })
      .strict()
      .nullable(),

    methodologyVersion: z.string(),
    inputSnapshotHash: z.string(),
    computedAt: z.string(),

    // Reported, never scored. Present and empty when there is nothing to say,
    // so a consumer can tell "we looked and found none" from an older payload
    // that predates the field.
    dictionaryGaps: z.array(dictionaryGapSchema),

    // Never optional. A score that dropped its limitations would be the bare
    // number this project refuses to produce.
    limitations: z.array(z.string()),
  })
  .strict();

/**
 * Parse an unknown value as a Score, throwing if it does not conform.
 *
 * For consumers who want the contract enforced on their side, and for our own
 * tests. Not used on the hot path: the scorer builds the object, so validating
 * our own output on every request would cost time to catch a bug that only a
 * code change can introduce, and the tests already catch that.
 */
export function parseScore(value: unknown): Score {
  return scoreSchema.parse(value) as Score;
}

/** Same, without throwing. */
export function safeParseScore(value: unknown): z.SafeParseReturnType<unknown, unknown> {
  return scoreSchema.safeParse(value);
}

/*
 * Compile-time proof that the schema above and the Score interface in types.ts
 * are the same shape. If either gains a field the other lacks, one of these
 * stops compiling and `npm run typecheck` fails.
 */
type SchemaScore = z.infer<typeof scoreSchema>;

const _schemaSatisfiesInterface: SchemaScore extends Score ? true : false = true;
const _interfaceSatisfiesSchema: Score extends SchemaScore ? true : false = true;
void _schemaSatisfiesInterface;
void _interfaceSatisfiesSchema;
