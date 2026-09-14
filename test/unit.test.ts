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
import {
  applyEvmPatterns,
  fillMissingCapabilities,
  loadPatterns,
  settleEvmMetadataMutability,
  type Pattern,
} from '../src/patterns/resolve.js';
import { normalise } from '../src/signals/normalise.js';
import { snapshotHash, decodeSymbol } from '../src/pipeline.js';
import { findMetadataPda, parseMetadata, METADATA_PROGRAM_ID } from '../src/sources/metaplex.js';
import {
  implementationAddresses,
  findDictionaryGaps,
  privilegedFunctionTable,
  dispatchesMetadataMutator,
  metadataMutatorSignatures,
} from '../src/patterns/selectors.js';
import { selectorOf } from '../src/sources/keccak.js';
import { score } from '../src/scoring/model2.js';
import { isStale, expectationFor, type RegistryEntry } from '../src/registry/lookup.js';
import { renderDisclosure } from '../src/cli/disclosure.js';
import { verifyScore, canonical } from '../src/cli/verify.js';
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

describe('how a read resolved', () => {
  const addr = '0x' + '1'.repeat(40);
  const ownable = () =>
    pattern({ method: { kind: 'call-selector', callSelector: '0x8da5cb5b', signature: 'owner() returns (address)', returnType: 'address' } });
  const client = () => new RpcClient({ endpoints: ['https://a.invalid'] });

  it('records a getter that answered the zero address as answered and unset, and says renounced', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: ZERO_WORD })) as typeof fetch;
    const [obs] = await applyEvmPatterns(client(), addr, [ownable()]);
    expect(obs!.value).toBeNull();
    expect(obs!.read).toBe('answered');
    expect(obs!.method).toMatch(/zero address: unset or renounced/);
    const { signals } = normalise([obs!], null);
    expect(signals[0]!.state).toBe('ABSENT');
    expect(signals[0]!.reasoning).toMatch(/is not set: owner\(\)/);
  });

  it('records a getter that reverted as missing, and says the capability was not found', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } })
    ) as typeof fetch;
    const [obs] = await applyEvmPatterns(client(), addr, [ownable()]);
    expect(obs!.value).toBeNull();
    expect(obs!.read).toBe('missing');
    const { signals } = normalise([obs!], null);
    expect(signals[0]!.reasoning).toMatch(/was not found/);
    expect(signals[0]!.reasoning).not.toMatch(/is not set/);
  });

  it('records a transport failure as unavailable', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'rate limit exceeded' } })
    ) as typeof fetch;
    const [obs] = await applyEvmPatterns(client(), addr, [ownable()]);
    expect(obs!.value).toBeUndefined();
    expect(obs!.read).toBe('unavailable');
  });

  it('reads a uint256 zero as absent and a positive value as the number', async () => {
    const fee = () =>
      pattern({
        capability: 'fee-control',
        method: { kind: 'call-selector', callSelector: '0xd85ba063', signature: 'buyTotalFees() returns (uint256)', returnType: 'uint256' },
      });
    globalThis.fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: ZERO_WORD })) as typeof fetch;
    const [zero] = await applyEvmPatterns(client(), addr, [fee()]);
    expect(zero!.value).toBeNull();
    expect(zero!.read).toBe('answered');
    expect(zero!.method).toMatch(/answered 0/);

    globalThis.fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x' + '0'.repeat(63) + '5' })) as typeof fetch;
    const [five] = await applyEvmPatterns(client(), addr, [fee()]);
    expect(five!.value).toBe('5');
    const { signals } = normalise([five!], null);
    expect(signals[0]!.state).toBe('PRESENT');
  });

  it('leaves the snapshot hash alone: the field explains a value, it does not change one', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const a: Observation = { capability: 'admin-authority', value: null, source: 'onchain', patternId: 'admin-ownable', observedAt: at };
    const b: Observation = { ...a, read: 'answered' };
    expect(snapshotHash([a])).toBe(snapshotHash([b]));
  });
});

describe('the gap scan and a renounced owner', () => {
  const at = '2026-01-01T00:00:00.000Z';
  const bytecodeWith = (selectors: string[]) => '0x6080604052' + selectors.map((s) => '63' + s.replace(/^0x/, '')).join('') + '00';
  const transferOwnership = selectorOf('transferOwnership(address)');
  const mint = selectorOf('mint(address,uint256)');
  const ownerRead = (read: Observation['read']): Observation => ({
    capability: 'admin-authority',
    value: null,
    read,
    source: 'onchain',
    patternId: 'admin-ownable',
    observedAt: at,
  });

  it('does not report transferOwnership when owner() answered the zero address', () => {
    expect(findDictionaryGaps(bytecodeWith([transferOwnership]), [], [ownerRead('answered')])).toHaveLength(0);
  });

  it('still reports it when owner() is not there at all', () => {
    const gaps = findDictionaryGaps(bytecodeWith([transferOwnership]), [], [ownerRead('missing')]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.note).not.toMatch(/renounced/);
  });

  it('tells the reader other functions may be dead once ownership is renounced', () => {
    const gaps = findDictionaryGaps(bytecodeWith([mint]), [], [ownerRead('answered')]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.signature).toBe('mint(address,uint256)');
    expect(gaps[0]!.note).toMatch(/Ownership is renounced/);
    expect(gaps[0]!.note).toMatch(/owner-gated/);
  });

  it('says nothing about renouncement when another admin mechanism is live', () => {
    // MKR: owner() answers zero, authority() answers a live address.
    const authority: Observation = {
      capability: 'admin-authority',
      value: '0x6eeb68b2c7a918f36b78e2db80430c7f8a8dd8f6',
      read: 'answered',
      source: 'onchain',
      patternId: 'admin-dsauth',
      observedAt: at,
    };
    const gaps = findDictionaryGaps(bytecodeWith([mint]), [], [ownerRead('answered'), authority]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.note).not.toMatch(/renounced/);
  });

  it('no longer lists burnFrom as privileged, and does list the launchpad setters', () => {
    const signatures = privilegedFunctionTable().functions.map((f) => f.signature);
    expect(signatures).not.toContain('burnFrom(address,uint256)');
    expect(signatures).toContain('updateBuyFees(uint256,uint256,uint256)');
    expect(signatures).toContain('enableTrading()');
    expect(signatures).toContain('setBlacklisted(address,bool)');
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
    // Against an empty dictionary rather than the real one. fee-control was the
    // example until 0.3.0 gave Ethereum a fee pattern, and metadata-mutability
    // until 0.6.0 gave it two; every capability now has an EVM pattern, so the
    // real dictionary can no longer reach this branch on this chain family.
    const filled = fillMissingCapabilities([], 'evm', [], {}, '2026-01-01T00:00:00.000Z');
    const byCap = new Map(filled.map((o) => [o.capability, o]));

    expect(byCap.size).toBe(7);
    const meta = byCap.get('metadata-mutability')!;
    expect(meta.value).toBeUndefined();
    expect(meta.patternId).toBeUndefined();
    expect(meta.method).toMatch(/no pattern/);

    const { signals } = normalise(filled, null);
    expect(signals.find((s) => s.capability === 'metadata-mutability')!.state).toBe('UNKNOWN');
    expect(signals.find((s) => s.capability === 'metadata-mutability')!.reasoning).toMatch(/No pattern in the dictionary/);
  });

  it('reads every capability on EVM, so no capability is dark on that chain', async () => {
    const patterns = await loadPatterns();
    const evmCapabilities = new Set(patterns.filter((p) => p.chainFamily === 'evm').map((p) => p.capability));
    const filled = fillMissingCapabilities([], 'evm', patterns, {}, '2026-01-01T00:00:00.000Z');

    for (const observation of filled) {
      expect(evmCapabilities.has(observation.capability)).toBe(true);
    }
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

describe('the gap scan follows a proxy to its implementation', () => {
  it('takes implementation addresses only from patterns whose slot holds the code', async () => {
    const patterns = await loadPatterns();
    const read = (patternId: string, value: string | null): Observation => ({
      capability: 'upgradeability',
      value,
      source: 'onchain',
      patternId,
      observedAt: '2026-01-01T00:00:00.000Z',
    });
    const implementation = '0x43506849D7C04F9138D1A2050bbF3A0c054402dd';

    const found = implementationAddresses(patterns, [
      read('proxy-eip1967', null),
      read('proxy-zeppelinos', implementation),
      // A beacon slot holds the beacon, and the admin slot holds the admin.
      // Neither is code that runs behind the token.
      read('proxy-beacon', '0x' + '1'.repeat(40)),
      read('proxy-admin-slot', '0x' + '2'.repeat(40)),
    ]);
    expect(found).toEqual([implementation.toLowerCase()]);
  });

  it('declares the slot on both implementation patterns and on nothing else', async () => {
    const patterns = await loadPatterns();
    const pointing = patterns.filter((p) => p.method.pointsTo === 'implementation').map((p) => p.id).sort();
    expect(pointing).toEqual(['proxy-eip1967', 'proxy-zeppelinos']);
  });
});

describe('verify: a published score recomputes from its own contents', () => {
  const at = '2026-01-01T00:00:00.000Z';
  const obs = (capability: Observation['capability'], patternId: string, value: Observation['value']): Observation => ({
    capability,
    value,
    source: 'onchain',
    patternId,
    observedAt: at,
  });
  const observations: Observation[] = [
    obs('mint-authority', 'admin-minter', '0x1a9c8182c09f50c8318d769245bea52c32be35bc'),
    obs('admin-authority', 'admin-ownable', null),
    obs('transfer-restriction', 'transfer-pausable', 'mechanism present, currently false/zero'),
    { capability: 'fee-control', value: undefined, source: 'onchain', observedAt: at },
  ];

  function published(): Record<string, unknown> {
    const { signals, disagreements } = normalise(observations, null);
    const s = score({
      chain: 'ethereum',
      address: '0x' + '1'.repeat(40),
      symbol: 'TST',
      signals,
      disagreements,
      unverified: [],
      registryEntry: null,
      inputSnapshotHash: snapshotHash(observations),
      computedAt: at,
      dictionaryGaps: [],
      gapScan: 'ran',
    });
    return JSON.parse(JSON.stringify(s));
  }

  it('passes on the scorer\'s own output, whatever order the keys are in', () => {
    const report = verifyScore(published());
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => [c.name, c.state])).toEqual([
      ['shape', 'ok'],
      ['snapshot hash', 'ok'],
      ['recompute', 'ok'],
    ]);
    expect(report.checks[2]!.detail).toMatch(/Byte-identical/);

    const reordered = JSON.parse(canonical(published()));
    expect(verifyScore(reordered).ok).toBe(true);
  });

  it('fails when a number was edited after scoring', () => {
    const edited = published() as { axes: { control: { value: number } } };
    edited.axes.control.value = 1;
    const report = verifyScore(edited);
    expect(report.ok).toBe(false);
    const recompute = report.checks.find((c) => c.name === 'recompute')!;
    expect(recompute.state).toBe('fail');
    expect(recompute.detail).toMatch(/axes/);
    expect(recompute.detail).toMatch(/control: published 1, recomputed/);
  });

  it('fails when an observation was edited, because the hash no longer follows', () => {
    const edited = published() as {
      axes: { control: { signals: Array<{ observations: Array<{ value: unknown }> }> } };
    };
    edited.axes.control.signals[0]!.observations[0]!.value = '0x' + 'f'.repeat(40);
    const report = verifyScore(edited);
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'snapshot hash')!.state).toBe('fail');
  });

  it('refuses something that is not a score, and says why', () => {
    const report = verifyScore({ chain: 'ethereum', axes: {} });
    expect(report.ok).toBe(false);
    expect(report.checks[0]!.state).toBe('fail');
    expect(report.checks[0]!.detail).toMatch(/not a Safegate score/);
  });

  it('does not pretend to verify axes across methodology versions', () => {
    const older = published() as { methodologyVersion: string };
    older.methodologyVersion = '0.1.8';
    const report = verifyScore(older);
    // The hash still follows from the observations; the axes are out of reach.
    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.name === 'snapshot hash')!.state).toBe('ok');
    expect(report.checks.find((c) => c.name === 'recompute')!.state).toBe('skipped');
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

  it('carries methodology 0.3.0', () => {
    expect(score({ ...input, signals: [] }).methodologyVersion).toBe('0.3.0');
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

describe('metadata mutability on EVM: the surface decides, not the probe', () => {
  const WHEN = '2026-01-01T00:00:00.000Z';

  /** What applyEvmPatterns records when a call-success probe reverts. */
  function probeMissed(patternId: string): Observation {
    return {
      capability: 'metadata-mutability',
      value: null,
      read: 'missing',
      source: 'onchain',
      patternId,
      method: `${patternId}() reverted, function not present`,
      observedAt: WHEN,
    };
  }

  const MISSED = [probeMissed('meta-scaled-balance'), probeMissed('meta-share-balance')];
  const NOTHING_DISPATCHED: ReadonlySet<string> = new Set<string>();

  function stateOf(observations: Observation[]): string {
    return normalise(observations, null).signals.find((s) => s.capability === 'metadata-mutability')!.state;
  }
  function reasoningOf(observations: Observation[]): string {
    return normalise(observations, null).signals.find((s) => s.capability === 'metadata-mutability')!.reasoning;
  }

  it('would read ABSENT from the probes alone, which is the trap this guards', () => {
    // Not the shipped behaviour: this is what resolveState does to two reverted
    // probes if nothing settles the capability first. A rebasing probe missing
    // says nothing about whether a name can be rewritten, so shipping the
    // patterns without settleEvmMetadataMutability would have turned every
    // non-rebasing token into a verified clean reading.
    expect(stateOf(MISSED)).toBe('ABSENT');
  });

  it('reads ABSENT on fixed bytecode that dispatches no metadata mutator', () => {
    const settled = settleEvmMetadataMutability(
      MISSED,
      { selectors: NOTHING_DISPATCHED, bytecodeFixed: true },
      WHEN
    );
    expect(stateOf(settled)).toBe('ABSENT');
    expect(reasoningOf(settled)).toMatch(/cannot be present/);
    expect(reasoningOf(settled)).toMatch(/bytecode cannot be replaced/);
    // The absence names how many spellings it is an absence of.
    expect(reasoningOf(settled)).toMatch(new RegExp(String(metadataMutatorSignatures().length)));
  });

  it('stays UNKNOWN when the bytecode can be replaced', () => {
    const settled = settleEvmMetadataMutability(
      MISSED,
      { selectors: NOTHING_DISPATCHED, bytecodeFixed: false },
      WHEN
    );
    expect(stateOf(settled)).toBe('UNKNOWN');
    expect(reasoningOf(settled)).toMatch(/not evidence of absence/);
  });

  it('stays UNKNOWN when the dispatch surface could not be read in full', () => {
    expect(stateOf(settleEvmMetadataMutability(MISSED, undefined, WHEN))).toBe('UNKNOWN');
  });

  it('stays UNKNOWN when a setter is dispatched but nothing reads who holds it', () => {
    const withSetter = new Set([selectorOf('setName(string)')]);
    const settled = settleEvmMetadataMutability(MISSED, { selectors: withSetter, bytecodeFixed: true }, WHEN);
    expect(stateOf(settled)).toBe('UNKNOWN');
  });

  it('leaves a positive derived-balance reading untouched', () => {
    const found: Observation = {
      capability: 'metadata-mutability',
      value: 'mechanism present, currently ≈1.15e+77',
      read: 'answered',
      source: 'onchain',
      patternId: 'meta-scaled-balance',
      method: 'scaledTotalSupply() exists, so the capability is built in',
      observedAt: WHEN,
    };
    const settled = settleEvmMetadataMutability([found, MISSED[1]!], { selectors: NOTHING_DISPATCHED, bytecodeFixed: true }, WHEN);
    expect(settled).toEqual([found, MISSED[1]!]);
    expect(stateOf(settled)).toBe('PRESENT');
  });

  it('keeps the licensing set and the gap table as one list', () => {
    const { functions } = privilegedFunctionTable();
    const fromTable = functions.filter((f) => f.capability === 'metadata-mutability').map((f) => f.signature);
    expect([...metadataMutatorSignatures()].sort()).toEqual([...fromTable].sort());
    // Every spelling the absence is an absence of is one the gap scan reports.
    for (const signature of metadataMutatorSignatures()) {
      expect(dispatchesMetadataMutator(new Set([selectorOf(signature)]))).toBe(true);
    }
    expect(dispatchesMetadataMutator(new Set([selectorOf('transfer(address,uint256)')]))).toBe(false);
  });
});

describe('a call-success uint256 reads as a number, not as an address', () => {
  const addr = '0x' + '1'.repeat(40);
  const client = () => new RpcClient({ endpoints: ['https://a.invalid'] });
  const scaled = () =>
    pattern({
      capability: 'metadata-mutability',
      presenceIndicatedBy: 'call-success',
      method: {
        kind: 'call-selector',
        callSelector: '0xb1bf962d',
        signature: 'scaledTotalSupply() returns (uint256)',
        returnType: 'uint256',
      },
    });

  async function valueFor(word: string): Promise<string> {
    globalThis.fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: word })) as typeof fetch;
    const [obs] = await applyEvmPatterns(client(), addr, [scaled()]);
    return String(obs!.value);
  }

  it('prints a small value in full', async () => {
    expect(await valueFor('0x' + '0'.repeat(60) + '2710')).toMatch(/currently 10000$/);
  });

  it('prints zero as zero rather than as a boolean', async () => {
    // A call-success probe answering zero still proves the mechanism, and the
    // reader of a rate wants "0", not "false/zero".
    expect(await valueFor(ZERO_WORD)).toMatch(/currently 0$/);
  });

  it('prints a huge value in exponential rather than seventy digits of hex', async () => {
    // AMPL's gon supply. Before this it rendered as 0xffffffff..., which reads
    // as a truncated address and tells nobody anything.
    const value = await valueFor('0x' + 'f'.repeat(64));
    expect(value).toMatch(/currently ≈1\.16e\+77$/);
    expect(value).not.toMatch(/0x/);
  });
});
