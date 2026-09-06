/**
 * Offline tests. No network. These cover the parts of the pipeline whose
 * correctness does not depend on what a chain currently says: error
 * classification, address decoding, the missing-capability fill, the snapshot
 * hash, the Metaplex reader, and the scorer's warnings.
 *
 * The live regression locks are in regression.test.ts behind SAFEGATE_LIVE=1.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { RpcClient, RpcError, ethCall, classifyCode, wordToAddress, isBurnAddress, isRevertError } from '../src/sources/rpc.js';
import { applyEvmPatterns, fillMissingCapabilities, loadPatterns, type Pattern } from '../src/patterns/resolve.js';
import { normalise } from '../src/signals/normalise.js';
import { snapshotHash, decodeSymbol } from '../src/pipeline.js';
import { findMetadataPda, parseMetadata, METADATA_PROGRAM_ID } from '../src/sources/metaplex.js';
import { score } from '../src/scoring/model2.js';
import { isStale, expectationFor, type RegistryEntry } from '../src/registry/lookup.js';
import { renderDisclosure } from '../src/cli/disclosure.js';
import type { Observation } from '../src/types.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const ZERO_WORD = '0x' + '0'.repeat(64);
const ONE_WORD = '0x' + '0'.repeat(63) + '1';

function pattern(overrides: Partial<Pattern> & { method: Pattern['method'] }): Pattern {
  return {
    id: 'test-pattern',
    chainFamily: 'evm',
    capability: 'admin-authority',
    detects: 'test',
    rationale: 'test rationale long enough to pass any length check that exists',
    addedAt: '2026-01-01',
    ...overrides,
  };
}

describe('JSON-RPC error classification', () => {
  it('treats code 3 and "revert" messages as reverts, everything else as transport', () => {
    expect(isRevertError(3, 'execution reverted')).toBe(true);
    expect(isRevertError(-32000, 'execution reverted: nope')).toBe(true);
    expect(isRevertError(-32005, 'rate limit exceeded')).toBe(false);
    expect(isRevertError(-32601, 'method not found')).toBe(false);
    expect(isRevertError(undefined, undefined)).toBe(false);
  });

  it('returns a revert as an answer and does not fail over', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } });
    }) as typeof fetch;

    const client = new RpcClient({ endpoints: ['https://a.invalid', 'https://b.invalid'] });
    const result = await ethCall(client, '0x' + '1'.repeat(40), '0x8da5cb5b');
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it('fails over on a rate limit and reports transport failure, never a revert', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'rate limit exceeded' } })
    ) as typeof fetch;

    const client = new RpcClient({ endpoints: ['https://a.invalid', 'https://b.invalid'] });
    await expect(ethCall(client, '0x' + '1'.repeat(40), '0x8da5cb5b')).rejects.toMatchObject({ kind: 'rpc' });
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
  });

  it('records a throttled probe as UNKNOWN, not as absent', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'rate limit exceeded' } })
    ) as typeof fetch;

    const client = new RpcClient({ endpoints: ['https://a.invalid'] });
    const p = pattern({ method: { kind: 'call-selector', callSelector: '0x8da5cb5b', returnType: 'address' } });
    const [obs] = await applyEvmPatterns(client, '0x' + '1'.repeat(40), [p]);
    expect(obs!.value).toBeUndefined();
    const { signals } = normalise([obs!], null);
    expect(signals[0]!.state).toBe('UNKNOWN');
  });
});

describe('what sits at an EVM address', () => {
  it('classifies no code, an EIP-7702 delegation, and a contract', () => {
    expect(classifyCode('0x')).toBe('none');
    expect(classifyCode('')).toBe('none');
    expect(classifyCode(null)).toBe('none');
    expect(classifyCode('0xef0100' + 'a'.repeat(40))).toBe('eip7702-delegation');
    expect(classifyCode('0x6080604052')).toBe('contract');
  });
});

describe('call-success probes', () => {
  it('does not count empty return data as the function existing', async () => {
    // WETH9's fallback answers every selector with 0x. Before 0.2.0 that read
    // as "paused() exists", which is how WETH scored exit 100.
    globalThis.fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x' })) as typeof fetch;

    const client = new RpcClient({ endpoints: ['https://a.invalid'] });
    const p = pattern({
      capability: 'transfer-restriction',
      presenceIndicatedBy: 'call-success',
      method: { kind: 'call-selector', callSelector: '0x5c975abb', signature: 'paused() returns (bool)', returnType: 'bool' },
    });
    const [obs] = await applyEvmPatterns(client, '0x' + '1'.repeat(40), [p]);
    expect(obs!.value).toBeNull();
    expect(obs!.method).toMatch(/no data/);
  });

  it('counts a full word of return data as the function existing, whatever it says', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: ZERO_WORD })) as typeof fetch;

    const client = new RpcClient({ endpoints: ['https://a.invalid'] });
    const p = pattern({
      capability: 'transfer-restriction',
      presenceIndicatedBy: 'call-success',
      method: { kind: 'call-selector', callSelector: '0x5c975abb', signature: 'paused() returns (bool)', returnType: 'bool' },
    });
    const [obs] = await applyEvmPatterns(client, '0x' + '1'.repeat(40), [p]);
    expect(obs!.value).toMatch(/mechanism present/);
  });

  it('appends fixed callArgs to the selector', async () => {
    let sent = '';
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)).params[0].data;
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: ZERO_WORD });
    }) as typeof fetch;

    const client = new RpcClient({ endpoints: ['https://a.invalid'] });
    const p = pattern({
      capability: 'freeze-authority',
      presenceIndicatedBy: 'call-success',
      method: { kind: 'call-selector', callSelector: '0xfe575a87', callArgs: ZERO_WORD, returnType: 'bool' },
    });
    await applyEvmPatterns(client, '0x' + '1'.repeat(40), [p]);
    expect(sent).toBe('0xfe575a87' + '0'.repeat(64));
  });
});

describe('nonEmptyMeans: capability-absent', () => {
  it('inverts a set flag into an absence and an unset flag into a presence', async () => {
    const client = new RpcClient({ endpoints: ['https://a.invalid'] });
    const p = pattern({
      capability: 'mint-authority',
      nonEmptyMeans: 'capability-absent',
      method: { kind: 'call-selector', callSelector: '0x05d2035b', signature: 'mintingFinished() returns (bool)', returnType: 'bool' },
    });

    globalThis.fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: ONE_WORD })) as typeof fetch;
    const [setFlag] = await applyEvmPatterns(client, '0x' + '1'.repeat(40), [p]);
    expect(setFlag!.value).toBeNull();

    globalThis.fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: ZERO_WORD })) as typeof fetch;
    const [unsetFlag] = await applyEvmPatterns(client, '0x' + '1'.repeat(40), [p]);
    expect(unsetFlag!.value).toMatch(/not disabled/);
  });
});

describe('every capability gets an observation', () => {
  it('emits UNKNOWN for a capability no pattern reads on this chain', async () => {
    const patterns = await loadPatterns();
    const filled = fillMissingCapabilities([], 'evm', patterns, {}, '2026-01-01T00:00:00.000Z');
    const byCap = new Map(filled.map((o) => [o.capability, o]));

    expect(byCap.size).toBe(7);
    const fee = byCap.get('fee-control')!;
    expect(fee.value).toBeUndefined();
    expect(fee.patternId).toBeUndefined();
    expect(fee.method).toMatch(/no pattern/);

    const { signals } = normalise(filled, null);
    expect(signals.find((s) => s.capability === 'fee-control')!.state).toBe('UNKNOWN');
    expect(signals.find((s) => s.capability === 'fee-control')!.reasoning).toMatch(/No pattern in the dictionary/);
  });

  it('records a verified absence for extension-only capabilities on a legacy Solana mint', async () => {
    const patterns = await loadPatterns();
    const filled = fillMissingCapabilities([], 'solana', patterns, { legacySolanaMint: true }, '2026-01-01T00:00:00.000Z');
    const fee = filled.find((o) => o.capability === 'fee-control')!;
    expect(fee.value).toBeNull();
    expect(fee.method).toMatch(/legacy Token program/);

    const { signals } = normalise(filled, null);
    expect(signals.find((s) => s.capability === 'fee-control')!.state).toBe('ABSENT');
    expect(signals.find((s) => s.capability === 'fee-control')!.reasoning).toMatch(/cannot be present/);
  });

  it('does not treat a Token-2022 mint that way', async () => {
    const patterns = await loadPatterns();
    const filled = fillMissingCapabilities([], 'solana', patterns, { legacySolanaMint: false }, '2026-01-01T00:00:00.000Z');
    expect(filled.find((o) => o.capability === 'fee-control')!.value).toBeUndefined();
  });

  it('leaves an observed capability alone', () => {
    const observed: Observation = {
      capability: 'mint-authority',
      value: '0xabc',
      source: 'onchain',
      patternId: 'x',
      observedAt: '2026-01-01T00:00:00.000Z',
    };
    const filled = fillMissingCapabilities([observed], 'evm', [], {}, '2026-01-01T00:00:00.000Z');
    expect(filled.filter((o) => o.capability === 'mint-authority')).toHaveLength(1);
    expect(filled[0]).toBe(observed);
  });
});

describe('the snapshot hash', () => {
  const base: Observation[] = [
    { capability: 'mint-authority', value: '0xabc', source: 'onchain', patternId: 'b', observedAt: '2026-01-01T00:00:00.000Z', method: 'x' },
    { capability: 'admin-authority', value: null, source: 'onchain', patternId: 'a', observedAt: '2026-01-01T00:00:00.000Z' },
    { capability: 'fee-control', value: undefined, source: 'onchain', observedAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('ignores order, timestamps and method notes', () => {
    const shuffled = [base[2]!, base[0]!, base[1]!].map((o) => ({ ...o, observedAt: '2030-01-01T00:00:00.000Z', method: 'different' }));
    expect(snapshotHash(shuffled)).toBe(snapshotHash(base));
  });

  it('changes when a value changes', () => {
    const changed = base.map((o) => (o.capability === 'mint-authority' ? { ...o, value: '0xdef' } : o));
    expect(snapshotHash(changed)).not.toBe(snapshotHash(base));
  });

  it('distinguishes "could not read" from "read and found nothing"', () => {
    const readNothing = base.map((o) => (o.capability === 'fee-control' ? { ...o, value: null } : o));
    expect(snapshotHash(readNothing)).not.toBe(snapshotHash(base));
  });
});

describe('address and symbol decoding', () => {
  it('extracts the low 20 bytes and treats zero as unset', () => {
    expect(wordToAddress(ZERO_WORD)).toBeNull();
    expect(wordToAddress('0x' + '0'.repeat(24) + 'ab'.repeat(20))).toBe('0x' + 'ab'.repeat(20));
    expect(wordToAddress('0x')).toBeNull();
    expect(isBurnAddress('0x000000000000000000000000000000000000dEaD')).toBe(true);
    expect(isBurnAddress('0x' + 'ab'.repeat(20))).toBe(false);
  });

  it('decodes a dynamic string and a bytes32 symbol', () => {
    const str = '0x' + '20'.padStart(64, '0') + '4'.padStart(64, '0') + Buffer.from('USDC').toString('hex').padEnd(64, '0');
    expect(decodeSymbol(str)).toBe('USDC');
    const b32 = '0x' + Buffer.from('MKR').toString('hex').padEnd(64, '0');
    expect(decodeSymbol(b32)).toBe('MKR');
    expect(decodeSymbol('0x')).toBeUndefined();
  });
});

describe('the Metaplex reader', () => {
  it('derives the documented metadata account for USDC', () => {
    // Checked against mainnet on 2026-09-06: this account is owned by the
    // Metaplex program and holds USDC's metadata.
    const { address } = findMetadataPda('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(address).toBe('5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq');
    expect(METADATA_PROGRAM_ID).toBe('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  });

  it('parses a synthetic account and refuses a malformed one', () => {
    const str = (text: string, pad: number): Buffer => {
      const body = Buffer.alloc(pad);
      body.write(text, 'utf8');
      const len = Buffer.alloc(4);
      len.writeUInt32LE(pad, 0);
      return Buffer.concat([len, body]);
    };
    const authority = Buffer.alloc(32, 7);
    const mint = Buffer.alloc(32, 9);
    const account = Buffer.concat([
      Buffer.from([4]),
      authority,
      mint,
      str('Test', 32),
      str('TST', 10),
      str('https://x', 200),
      Buffer.from([0x64, 0x00]),
      Buffer.from([0]),
      Buffer.from([0]),
      Buffer.from([1]),
    ]);
    const meta = parseMetadata(Uint8Array.from(account));
    expect(meta.name).toBe('Test');
    expect(meta.symbol).toBe('TST');
    expect(meta.sellerFeeBasisPoints).toBe(100);
    expect(meta.isMutable).toBe(true);

    expect(() => parseMetadata(Uint8Array.from(account.subarray(0, 40)))).toThrow(/truncated/);
    const wrongKey = Buffer.from(account);
    wrongKey[0] = 1;
    expect(() => parseMetadata(Uint8Array.from(wrongKey))).toThrow(/key/);
  });
});

describe('the scorer', () => {
  const input = {
    chain: 'ethereum' as const,
    address: '0xtest',
    disagreements: [],
    unverified: [],
    registryEntry: null,
    inputSnapshotHash: 'sha256:fixed',
    computedAt: '2026-01-01T00:00:00.000Z',
  };

  it('states the coverage threshold it actually applies', () => {
    const signals = [
      { capability: 'mint-authority' as const, state: 'PRESENT' as const, axis: 'control' as const, observations: [], reasoning: 't' },
      { capability: 'admin-authority' as const, state: 'UNKNOWN' as const, axis: 'control' as const, observations: [], reasoning: 't' },
      { capability: 'fee-control' as const, state: 'UNKNOWN' as const, axis: 'exit' as const, observations: [], reasoning: 't' },
    ];
    const result = score({ ...input, signals, gapScan: 'ran' });
    expect(result.limitations.some((l) => /Fewer than 60%/.test(l))).toBe(true);
    expect(result.limitations.some((l) => /two thirds/.test(l))).toBe(false);
  });

  it('carries methodology 0.2.0', () => {
    expect(score({ ...input, signals: [] }).methodologyVersion).toBe('0.2.0');
  });
});

describe('registry expiry', () => {
  const entry: RegistryEntry = {
    id: 'x',
    chain: 'ethereum',
    address: '0x' + '1'.repeat(40),
    symbol: 'X',
    name: 'X',
    issuer: { name: 'X' },
    archetype: 'utility',
    expectedCapabilities: [{ capability: 'mint-authority', justification: 'test' }],
    evidence: [],
    commercialRelationship: null,
    verifiedAt: '2026-01-01',
    reviewDue: '2027-01-01',
    approvedBy: 'test',
  };

  it('stops granting EXPECTED after reviewDue', () => {
    expect(isStale(entry, new Date('2026-06-01'))).toBe(false);
    expect(isStale(entry, new Date('2027-06-01'))).toBe(true);
    expect(expectationFor(entry, 'mint-authority', new Date('2026-06-01'))).not.toBeNull();
    expect(expectationFor(entry, 'mint-authority', new Date('2027-06-01'))).toBeNull();
  });
});

describe('disclosure generation', () => {
  it('is deterministic and dates itself from the registry, not the clock', () => {
    const entries: RegistryEntry[] = [
      { id: 'a', chain: 'ethereum', address: '0x' + '1'.repeat(40), symbol: 'A', name: 'A', issuer: { name: 'A' }, archetype: 'utility', expectedCapabilities: [], evidence: [], commercialRelationship: null, verifiedAt: '2026-03-01', approvedBy: 't' },
      { id: 'b', chain: 'solana', address: 'B'.repeat(32), symbol: 'B', name: 'B', issuer: { name: 'B' }, archetype: 'utility', expectedCapabilities: [], evidence: [], commercialRelationship: 'sponsor', verifiedAt: '2026-01-01', approvedBy: 't' },
    ];
    const first = renderDisclosure(entries);
    expect(renderDisclosure(entries)).toBe(first);
    expect(first).toMatch(/Registry as of 2026-03-01/);
    expect(first).toMatch(/\| B \(b\) \| solana \| sponsor \|/);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
