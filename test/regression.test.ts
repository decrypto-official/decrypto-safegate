/**
 * Regression locks.
 *
 * Every case here is a mistake a naive implementation actually makes. They exist
 * so those mistakes cannot come back silently. The two headline cases, USDC's
 * proxy and UNI's minter, are the reason patterns/ exists at all.
 *
 * Blocks that read mainnet are declared with `describeLive` and run only when
 * SAFEGATE_LIVE=1 (`npm run test:live`, nightly in CI). Mocking them would test
 * the mocks rather than our reading of the chain. The offline blocks run on
 * every `npm test`. Offline unit coverage of the pipeline is in unit.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, cp } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse } from '../src/pipeline.js';
import { loadPatterns, PatternLoadError } from '../src/patterns/resolve.js';
import { loadRegistry, findEntry, RegistryLoadError } from '../src/registry/lookup.js';
import { findDataDir, clearDataDirCache } from '../src/data-root.js';

const TIMEOUT = 60_000;
const LIVE = process.env.SAFEGATE_LIVE === '1';
const describeLive = LIVE ? describe : describe.skip;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const UNI_ETH = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
const PEPE_ETH = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
const MKR_ETH = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2';
const WBTC_ETH = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
const ENS_ETH = '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RAY_SOL = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
const PYUSD_SOL = '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo';

describeLive('USDC on Ethereum: the proxy false negative', () => {
  it(
    'detects upgradeability via the legacy zeppelinos slot, not EIP-1967',
    async () => {
      const result = await analyse('ethereum', USDC_ETH);
      const signal = result.axes.control.signals.find((s) => s.capability === 'upgradeability');

      expect(signal).toBeDefined();
      // Reading only EIP-1967 returns zero here and would wrongly say ABSENT.
      expect(signal!.state).toBe('EXPECTED');

      const hit = signal!.observations.find((o) => o.value !== null && o.value !== undefined);
      expect(hit?.patternId).toBe('proxy-zeppelinos');
      expect(String(hit?.value).toLowerCase()).toBe('0x43506849d7c04f9138d1a2050bbf3a0c054402dd');
    },
    TIMEOUT
  );

  it(
    'treats a live pause mechanism as present even when it returns false',
    async () => {
      const result = await analyse('ethereum', USDC_ETH);
      const signal = result.axes.exit.signals.find((s) => s.capability === 'transfer-restriction');

      // paused() returns false. The capability still exists, and capability is
      // what gets scored, not whether it is engaged at this instant.
      expect(signal?.state).toBe('EXPECTED');
      expect(signal?.state).not.toBe('ABSENT');
    },
    TIMEOUT
  );
});

describeLive('UNI on Ethereum: the renounced-ownership false negative', () => {
  it(
    'finds the live minter even though owner() reverts',
    async () => {
      const result = await analyse('ethereum', UNI_ETH);
      const signal = result.axes.control.signals.find((s) => s.capability === 'mint-authority');

      expect(signal).toBeDefined();
      // A naive owner()-only reader concludes "renounced, safe". It is not.
      expect(signal!.state).toBe('EXPECTED');

      const hit = signal!.observations.find((o) => o.value !== null && o.value !== undefined);
      expect(hit?.patternId).toBe('admin-minter');
      expect(String(hit?.value).toLowerCase()).toBe('0x1a9c8182c09f50c8318d769245bea52c32be35bc');
    },
    TIMEOUT
  );

  it(
    'never reports a reverting owner() as proof of renouncement',
    async () => {
      const result = await analyse('ethereum', UNI_ETH);
      const mint = result.axes.control.signals.find((s) => s.capability === 'mint-authority');
      expect(mint!.state).not.toBe('ABSENT');
    },
    TIMEOUT
  );
});

describeLive('Solana USDC: expected capabilities are not risk', () => {
  it(
    'marks mint and freeze authority EXPECTED via the registry, not PRESENT',
    async () => {
      const result = await analyse('solana', USDC_SOL);

      const mint = result.axes.control.signals.find((s) => s.capability === 'mint-authority');
      const freeze = result.axes.control.signals.find((s) => s.capability === 'freeze-authority');

      // Both authorities are genuinely live on chain. A blanket rule would call
      // this the most dangerous token in the set. It is the safest.
      expect(mint?.state).toBe('EXPECTED');
      expect(freeze?.state).toBe('EXPECTED');
      expect(result.axes.control.value).toBe(0);

      // The justification must be shown, never implied.
      expect(mint?.expectedBecause).toBeTruthy();
      expect(freeze?.expectedBecause).toMatch(/lawful order|freeze/i);
    },
    TIMEOUT
  );

  it(
    'declares holder concentration as unverified rather than omitting it',
    async () => {
      const result = await analyse('solana', USDC_SOL);
      const concentration = result.unverified.find((u) => /concentration/i.test(u.label));

      expect(concentration).toBeDefined();
      expect(concentration!.source).toBe('rugcheck');
      expect(concentration!.caveat).toMatch(/not.*independently confirmed/i);
    },
    TIMEOUT
  );
});

describeLive('the absent-is-not-safe rule', () => {
  it(
    'gives a registry-less token no expected capabilities',
    async () => {
      const result = await analyse('ethereum', PEPE_ETH);
      expect(result.registryEntry).toBeNull();
      const expected = Object.values(result.axes)
        .flatMap((a) => a.signals)
        .filter((s) => s.state === 'EXPECTED');
      expect(expected).toHaveLength(0);
    },
    TIMEOUT
  );

  it(
    'never emits a score without coverage and limitations attached',
    async () => {
      const result = await analyse('solana', RAY_SOL);
      expect(result.coverage).toBeDefined();
      expect(result.coverage.applicable).toBeGreaterThan(0);
      expect(result.limitations.length).toBeGreaterThan(0);
      // A bare zero would read as "no incidents, therefore safe".
      expect(result.incident).toBe('insufficient-data');
    },
    TIMEOUT
  );
});

describe('reproducibility', () => {
  it(
    'produces an identical score from identical inputs',
    async () => {
      const { score } = await import('../src/scoring/model2.js');
      const input = {
        chain: 'ethereum' as const,
        address: '0xtest',
        signals: [
          {
            capability: 'mint-authority' as const,
            state: 'PRESENT' as const,
            axis: 'control' as const,
            observations: [],
            reasoning: 'test',
          },
        ],
        disagreements: [],
        unverified: [],
        registryEntry: null,
        inputSnapshotHash: 'sha256:fixed',
        computedAt: '2026-07-22T00:00:00.000Z',
      };

      // The scorer is pure, so the same inputs must serialise identically.
      expect(JSON.stringify(score(input))).toBe(JSON.stringify(score(input)));
    },
    TIMEOUT
  );
});

/**
 * Data availability.
 *
 * The rest of this suite runs against a real filesystem, so it cannot see a
 * packaging fault that leaves patterns/ or registry/ out of a deployment bundle.
 * These tests point the loaders at directories that are missing or empty, which
 * is the state a broken deploy produces.
 *
 * That state is dangerous rather than merely broken: with no patterns there are
 * no signals, and a score with no signals reads 0 on every axis, which is the
 * best-looking result the product can render.
 */
/**
 * Runtime data location.
 *
 * A bundler inlines `import.meta.url` as a literal build-time path, so in a
 * serverless deployment the module-relative route to patterns/ and registry/
 * points at the build machine's checkout and does not exist. The data is present
 * at the deployment root instead.
 *
 * These tests reproduce that split: data at the working directory, module path
 * useless. Local runs cannot otherwise distinguish the two, because on a dev
 * machine both happen to resolve to the same place.
 */
describe('runtime data location', () => {
  it('finds the data at the working directory when the module path is useless', async () => {
    const deployRoot = await mkdtemp(join(tmpdir(), 'safegate-deploy-'));
    await cp(join(REPO_ROOT, 'patterns'), join(deployRoot, 'patterns'), { recursive: true });
    await cp(join(REPO_ROOT, 'registry'), join(deployRoot, 'registry'), { recursive: true });

    const original = process.cwd();
    try {
      process.chdir(deployRoot);
      clearDataDirCache();

      // realpath, because macOS resolves /var to /private/var.
      expect(await realpath(await findDataDir('patterns'))).toBe(
        await realpath(join(deployRoot, 'patterns'))
      );
      expect(await realpath(await findDataDir('registry'))).toBe(
        await realpath(join(deployRoot, 'registry'))
      );
    } finally {
      process.chdir(original);
      clearDataDirCache();
    }
  });

  it('honours SAFEGATE_DATA_ROOT as an override', async () => {
    const root = await mkdtemp(join(tmpdir(), 'safegate-override-'));
    await cp(join(REPO_ROOT, 'patterns'), join(root, 'patterns'), { recursive: true });

    process.env.SAFEGATE_DATA_ROOT = root;
    clearDataDirCache();
    try {
      expect(await realpath(await findDataDir('patterns'))).toBe(await realpath(join(root, 'patterns')));
    } finally {
      delete process.env.SAFEGATE_DATA_ROOT;
      clearDataDirCache();
    }
  });

  // There is no test here for "data nowhere at all". Running from inside the repo,
  // the module-relative fallback correctly finds the real directories, which is
  // the behaviour local runs depend on. The loud-failure path is covered by the
  // data availability tests below, which pass an explicit base directory.
});

describe('data availability', () => {
  it('throws when the pattern directory is missing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'safegate-missing-'));
    await expect(loadPatterns(join(empty, 'nope'))).rejects.toThrow(PatternLoadError);
  });

  it('throws when the pattern directory exists but holds nothing', async () => {
    const base = await mkdtemp(join(tmpdir(), 'safegate-bare-'));
    await mkdir(join(base, 'evm'), { recursive: true });
    await mkdir(join(base, 'solana'), { recursive: true });
    await expect(loadPatterns(base)).rejects.toThrow(/no usable patterns/i);
  });

  it('throws when the registry directory is missing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'safegate-missing-reg-'));
    await expect(loadRegistry(join(empty, 'nope'))).rejects.toThrow(RegistryLoadError);
  });

  it('throws when the registry directory exists but holds nothing', async () => {
    const base = await mkdtemp(join(tmpdir(), 'safegate-bare-reg-'));
    await mkdir(join(base, 'issuers', 'ethereum'), { recursive: true });
    await mkdir(join(base, 'issuers', 'solana'), { recursive: true });
    await expect(loadRegistry(base)).rejects.toThrow(/no usable entries/i);
  });

  it('names the likely deployment cause in the error', async () => {
    // Whoever hits this in production should not have to guess why.
    const empty = await mkdtemp(join(tmpdir(), 'safegate-msg-'));
    await expect(loadPatterns(join(empty, 'nope'))).rejects.toThrow(/build output/i);
    await expect(loadRegistry(join(empty, 'nope'))).rejects.toThrow(/build output/i);
  });
});

describe('an unscored axis is never reported as zero', () => {
  it('marks an axis with nothing resolved as unassessed rather than 0', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const result = score({
      chain: 'ethereum',
      address: '0xtest',
      signals: [],
      disagreements: [],
      unverified: [],
      registryEntry: null,
      inputSnapshotHash: 'sha256:fixed',
      computedAt: '2026-07-26T00:00:00.000Z',
    });

    // The number is 0 by arithmetic, so any consumer reading `value` alone would
    // see a perfect score. `assessed` is what tells them nothing was checked, and
    // the CLI and the dashboard both render "n/a" on the strength of it.
    for (const axis of ['control', 'transparency', 'exit'] as const) {
      expect(result.axes[axis].assessed).toBe(false);
      expect(result.axes[axis].coverage.scored).toBe(0);
      expect(result.axes[axis].coverage.applicable).toBe(0);
    }
    expect(result.coverage.ratio).toBe(0);
  });

  it('carries the distinction in the score object, not only in the renderers', async () => {
    // The CLI and the dashboard were fixed to print "n/a", but `/api/score` and
    // `--json` hand the raw object to someone else's code. If the only marker
    // lived in our own render functions, every integrator would still read a
    // flat 0 and call it clean. `assessed` has to survive serialisation.
    const { score } = await import('../src/scoring/model2.js');
    const result = score({
      chain: 'ethereum',
      address: '0xtest',
      signals: [],
      disagreements: [],
      unverified: [],
      registryEntry: null,
      inputSnapshotHash: 'sha256:fixed',
      computedAt: '2026-07-26T00:00:00.000Z',
    });

    const roundTripped = JSON.parse(JSON.stringify(result));
    for (const axis of ['control', 'transparency', 'exit'] as const) {
      expect(roundTripped.axes[axis]).toHaveProperty('assessed', false);
    }
  });

  it('marks an axis as assessed as soon as one signal resolves', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const result = score({
      chain: 'ethereum',
      address: '0xtest',
      signals: [
        {
          capability: 'mint-authority',
          axis: 'control',
          state: 'ABSENT',
          observations: [],
          reasoning: 'Mint authority is null. Verified as revoked.',
        },
        {
          capability: 'metadata-mutability',
          axis: 'transparency',
          state: 'UNKNOWN',
          observations: [],
          reasoning: 'Could not read the metadata account.',
        },
      ],
      disagreements: [],
      unverified: [],
      registryEntry: null,
      inputSnapshotHash: 'sha256:fixed',
      computedAt: '2026-07-26T00:00:00.000Z',
    });

    // A resolved ABSENT is a real finding: checked, and clean. It reads 0 and
    // means it.
    expect(result.axes.control.assessed).toBe(true);
    expect(result.axes.control.value).toBe(0);

    // An axis holding only UNKNOWN resolved nothing, so its 0 means nothing.
    // These two must never render the same way.
    expect(result.axes.transparency.assessed).toBe(false);
    expect(result.axes.transparency.value).toBe(0);
  });
});

describe('data integrity', () => {
  it('has a pattern id matching every filename', async () => {
    const patterns = await loadPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(14);
  });

  it('documents a rationale on every pattern', async () => {
    for (const pattern of await loadPatterns()) {
      expect(pattern.rationale, `${pattern.id} is missing a rationale`).toBeTruthy();
      expect(pattern.detects, `${pattern.id} is missing detects`).toBeTruthy();
    }
  });

  it('carries at least two independent evidence items on every registry entry', async () => {
    for (const entry of await loadRegistry()) {
      expect(entry.evidence.length, `${entry.id} needs two evidence items`).toBeGreaterThanOrEqual(2);
      const kinds = new Set(entry.evidence.map((e) => e.kind));
      expect(kinds.size, `${entry.id} evidence must not be all one kind`).toBeGreaterThan(1);
      expect(entry.approvedBy, `${entry.id} needs an approver`).toBeTruthy();
    }
  });

  it('justifies every expected capability', async () => {
    for (const entry of await loadRegistry()) {
      for (const cap of entry.expectedCapabilities) {
        expect(cap.justification.length, `${entry.id}/${cap.capability} needs a real justification`).toBeGreaterThan(20);
      }
    }
  });

  it('cites a verified mainnet address on every pattern', async () => {
    // CONTRIBUTING promises that coversExamples entries act as fixtures. This is
    // what makes that true: a pattern citing an address it cannot describe, or
    // citing nothing at all, fails here.
    for (const pattern of await loadPatterns()) {
      const examples = pattern.coversExamples ?? [];
      expect(examples.length, `${pattern.id} cites no verified address`).toBeGreaterThan(0);

      for (const ex of examples) {
        expect(ex.chain, `${pattern.id} example missing chain`).toBeTruthy();
        expect(ex.symbol, `${pattern.id} example missing symbol`).toBeTruthy();
        expect(ex.observed, `${pattern.id}/${ex.symbol} must record what was observed`).toBeTruthy();

        const shape =
          pattern.chainFamily === 'evm'
            ? /^0x[0-9a-fA-F]{40}$/
            : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        expect(shape.test(ex.address), `${pattern.id}/${ex.symbol} address ${ex.address} is malformed`).toBe(true);
      }
    }
  });

  it('points every registry entry at a well-formed address for its chain', async () => {
    for (const entry of await loadRegistry()) {
      const shape =
        entry.chain === 'ethereum' ? /^0x[0-9a-fA-F]{40}$/ : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      expect(shape.test(entry.address), `${entry.id} address ${entry.address} is malformed`).toBe(true);
    }
  });

  it('seeds at least the original 21 tokens', async () => {
    // A floor, not an exact count: CONTRIBUTING invites registry additions and
    // an exact count fails on every one of them.
    const registry = await loadRegistry();
    expect(registry.length).toBeGreaterThanOrEqual(21);
    expect(registry.filter((e) => e.chain === 'ethereum').length).toBeGreaterThanOrEqual(12);
    expect(registry.filter((e) => e.chain === 'solana').length).toBeGreaterThanOrEqual(9);
  });

  it('seeds at least one Token-2022 mint', async () => {
    // Without one, every Token-2022 pattern and the whole Solana gap scan are
    // dead code in CI: the eight original Solana entries all use the legacy
    // program, so the tests would pass without executing the feature.
    const registry = await loadRegistry();
    expect(registry.some((e) => e.address === PYUSD_SOL)).toBe(true);
  });

  it('finds entries case-insensitively on EVM', async () => {
    const registry = await loadRegistry();
    expect(findEntry(registry, 'ethereum', USDC_ETH.toLowerCase())).not.toBeNull();
    expect(findEntry(registry, 'ethereum', USDC_ETH.toUpperCase().replace('0X', '0x'))).not.toBeNull();
  });
});

/**
 * The published score contract.
 *
 * `GET /api/score` and `safegate score --json` hand the score object to code we
 * do not control. Until now nothing noticed when that shape changed: adding
 * `assessed` in 0.1.3 altered the contract and every test still passed.
 *
 * src/scoring/schema.ts holds the contract. It is enforced twice, and both
 * halves are exercised here: `tsc` proves the schema and the `Score` interface
 * describe the same shape, and these tests prove real scores satisfy it.
 */
describe('the score contract', () => {
  const input = {
    chain: 'ethereum' as const,
    address: '0xtest',
    signals: [
      {
        capability: 'mint-authority' as const,
        state: 'PRESENT' as const,
        axis: 'control' as const,
        observations: [
          {
            capability: 'mint-authority' as const,
            value: '0xabc',
            source: 'onchain' as const,
            patternId: 'admin-minter',
            observedAt: '2026-08-05T00:00:00.000Z',
          },
          {
            // "Could not look". This is the case that changes shape across a
            // JSON round trip, so the contract has to accept both forms.
            capability: 'mint-authority' as const,
            source: 'onchain' as const,
            observedAt: '2026-08-05T00:00:00.000Z',
          },
        ],
        reasoning: 'A live minter was found.',
      },
    ],
    disagreements: [],
    unverified: [],
    registryEntry: null,
    inputSnapshotHash: 'sha256:fixed',
    computedAt: '2026-08-05T00:00:00.000Z',
  };

  it('accepts a score the scorer actually produced', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const { parseScore } = await import('../src/scoring/schema.js');
    expect(() => parseScore(score(input))).not.toThrow();
  });

  it('accepts the same score after a JSON round trip', async () => {
    // The API sends JSON, not the in-memory object. An observation meaning "we
    // could not look" loses its key entirely on the way out, and the contract
    // must still hold on the other side.
    const { score } = await import('../src/scoring/model2.js');
    const { parseScore } = await import('../src/scoring/schema.js');
    const overWire = JSON.parse(JSON.stringify(score(input)));
    expect(() => parseScore(overWire)).not.toThrow();
  });

  it('rejects a field nobody declared', async () => {
    // Every object in the contract is strict. A field appearing without being
    // declared is drift, and drift in a published shape is a silent break for
    // whoever is parsing it.
    const { score } = await import('../src/scoring/model2.js');
    const { safeParseScore } = await import('../src/scoring/schema.js');
    const drifted = { ...score(input), somethingNew: true };
    expect(safeParseScore(drifted).success).toBe(false);
  });

  it('rejects a score that lost `assessed`', async () => {
    // The 0.1.3 fix is load-bearing: without `assessed` an unchecked axis is
    // indistinguishable from a clean one. Losing it must fail, not degrade.
    const { score } = await import('../src/scoring/model2.js');
    const { safeParseScore } = await import('../src/scoring/schema.js');
    const result = score(input);
    const stripped = JSON.parse(JSON.stringify(result));
    delete stripped.axes.control.assessed;
    expect(safeParseScore(stripped).success).toBe(false);
  });

  it('rejects a score that lost its limitations', async () => {
    // A score with no limitations attached is the bare number this project
    // exists not to produce.
    const { score } = await import('../src/scoring/model2.js');
    const { safeParseScore } = await import('../src/scoring/schema.js');
    const stripped = JSON.parse(JSON.stringify(score(input)));
    delete stripped.limitations;
    expect(safeParseScore(stripped).success).toBe(false);
  });

  it('rejects an axis value outside 0 to 100', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const { safeParseScore } = await import('../src/scoring/schema.js');
    const broken = JSON.parse(JSON.stringify(score(input)));
    broken.axes.control.value = 140;
    expect(safeParseScore(broken).success).toBe(false);
  });
});

/**
 * keccak256.
 *
 * Locked against published vectors because the selectors in
 * src/patterns/selectors.ts are derived from it rather than hand-copied. A
 * silently wrong hash would produce a table of plausible-looking selectors
 * that match nothing, and the dictionary-gap report would then be quietly
 * useless rather than visibly broken.
 *
 * The first vector is the one that catches the classic mistake. Node's
 * crypto has `sha3-256`, which is NIST SHA3 and pads differently; Ethereum
 * uses original Keccak padding. The two disagree on every input including
 * the empty string, and c5d24601... is the Keccak answer.
 */
describe('keccak256', () => {
  it('matches the published digest for the empty input', async () => {
    const { keccak256Hex } = await import('../src/sources/keccak.js');
    expect(keccak256Hex('')).toBe(
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    );
  });

  it('matches the published digest for "abc"', async () => {
    const { keccak256Hex } = await import('../src/sources/keccak.js');
    expect(keccak256Hex('abc')).toBe(
      '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'
    );
  });

  it('derives selectors that match the well-known ERC-20 and Ownable ones', async () => {
    // Independent corroboration: these four are on every mainnet contract and
    // their selectors are widely published. If the permutation were subtly
    // wrong these would not all land.
    const { selectorOf } = await import('../src/sources/keccak.js');
    expect(selectorOf('transfer(address,uint256)')).toBe('0xa9059cbb');
    expect(selectorOf('balanceOf(address)')).toBe('0x70a08231');
    expect(selectorOf('owner()')).toBe('0x8da5cb5b');
    expect(selectorOf('transferOwnership(address)')).toBe('0xf2fde38b');
  });

  it('hashes input longer than one absorb block', async () => {
    // 136 bytes is the rate; anything longer exercises multi-block absorption,
    // which a single-block implementation would get wrong.
    const { keccak256Hex } = await import('../src/sources/keccak.js');
    const long = 'a'.repeat(200);
    expect(keccak256Hex(long)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(keccak256Hex(long)).not.toBe(keccak256Hex('a'.repeat(199)));
  });
});

/**
 * Capabilities the dictionary cannot read.
 *
 * LIMITATIONS.md §5: "a token using an admin pattern we have never seen will
 * under-report its capabilities, and we will not know it happened. This is the
 * failure mode we consider most likely." These tests cover making it visible.
 *
 * Everything here runs on hand-built bytecode. The one part not exercised is
 * the eth_getCode fetch itself, which needs a live chain.
 */
describe('privileged functions no pattern reads', () => {
  /** Assemble bytecode that PUSH4s each selector, as a dispatcher does. */
  function bytecodeWith(selectors: string[]): string {
    return '0x6080604052' + selectors.map((s) => '63' + s.replace(/^0x/, '')).join('') + '00';
  }

  it('extracts selectors a dispatcher pushes', async () => {
    const { extractSelectors } = await import('../src/patterns/selectors.js');
    const { selectorOf } = await import('../src/sources/keccak.js');
    const mint = selectorOf('mint(address,uint256)');

    const found = extractSelectors(bytecodeWith([mint, '0xa9059cbb']));
    expect(found.has(mint)).toBe(true);
    expect(found.has('0xa9059cbb')).toBe(true);
  });

  it('does not read PUSH operand bytes as instructions', async () => {
    // The whole reason for walking opcodes. 0x7f is PUSH32, so the 32 bytes
    // after it are literal data. A scanner that just looked for the byte 0x63
    // would find the 0x63 buried in that operand and invent a selector from
    // whatever followed. Nothing here is a real instruction.
    const { extractSelectors } = await import('../src/patterns/selectors.js');
    const operand = '63deadbeef' + '00'.repeat(27);
    expect(operand.length / 2).toBe(32);

    const found = extractSelectors('0x7f' + operand + '00');
    expect(found.size).toBe(0);
  });

  it('reports a privileged function the dictionary has no pattern for', async () => {
    const { findDictionaryGaps } = await import('../src/patterns/selectors.js');
    const { selectorOf } = await import('../src/sources/keccak.js');

    const gaps = findDictionaryGaps(bytecodeWith([selectorOf('setMinter(address)')]), [], []);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.signature).toBe('setMinter(address)');
    expect(gaps[0]!.capability).toBe('mint-authority');
    // The wording has to put it as unaccounted for, never as absent.
    expect(gaps[0]!.note).toMatch(/unaccounted for rather than absent/i);
  });

  it('stays quiet about a selector a pattern already reads', async () => {
    // Not a gap. The dictionary reads it, so the capability is covered whatever
    // that particular call returned.
    const { findDictionaryGaps } = await import('../src/patterns/selectors.js');
    const { selectorOf } = await import('../src/sources/keccak.js');
    const pause = selectorOf('pause()');

    const patterns = [
      {
        id: 'transfer-pausable',
        capability: 'transfer-restriction',
        chainFamily: 'evm',
        method: { kind: 'call-selector', callSelector: pause },
      },
    ] as unknown as Parameters<typeof findDictionaryGaps>[1];

    expect(findDictionaryGaps(bytecodeWith([pause]), patterns, [])).toHaveLength(0);
  });

  it('stays quiet when the capability was already found another way', async () => {
    // UNI's case in reverse: if owner() or minter() already located an admin,
    // transferOwnership appearing in the bytecode adds nothing. The capability
    // is reported and scored already.
    const { findDictionaryGaps } = await import('../src/patterns/selectors.js');
    const { selectorOf } = await import('../src/sources/keccak.js');
    const transferOwnership = selectorOf('transferOwnership(address)');

    const observations = [
      {
        capability: 'admin-authority' as const,
        value: '0x1a9c8182c09f50c8318d769245bea52c32be35bc',
        source: 'onchain' as const,
        observedAt: '2026-08-05T00:00:00.000Z',
      },
    ];

    expect(findDictionaryGaps(bytecodeWith([transferOwnership]), [], observations)).toHaveLength(0);
  });

  it('still reports when a pattern looked for the capability and found nothing', async () => {
    // The dangerous case. A pattern ran, returned null, and the capability
    // reads ABSENT — while the contract plainly exposes a function we cannot
    // read. "Checked and clean" and "checked the wrong way" must not look alike.
    const { findDictionaryGaps } = await import('../src/patterns/selectors.js');
    const { selectorOf } = await import('../src/sources/keccak.js');
    const setMinter = selectorOf('setMinter(address)');

    const observations = [
      {
        capability: 'mint-authority' as const,
        value: null,
        source: 'onchain' as const,
        patternId: 'admin-minter',
        observedAt: '2026-08-05T00:00:00.000Z',
      },
    ];

    const gaps = findDictionaryGaps(bytecodeWith([setMinter]), [], observations);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.capability).toBe('mint-authority');
  });

  it('ignores ordinary ERC-20 surface', async () => {
    // transfer, approve and balanceOf are on every token and are not powers
    // held over anyone. Reporting them would bury the real findings.
    const { findDictionaryGaps } = await import('../src/patterns/selectors.js');
    const ordinary = ['0xa9059cbb', '0x095ea7b3', '0x70a08231', '0x18160ddd'];
    expect(findDictionaryGaps(bytecodeWith(ordinary), [], [])).toHaveLength(0);
  });

  it('survives bytecode that is empty or malformed', async () => {
    // eth_getCode returns 0x for an EOA, and a truncated response should not
    // throw in the middle of producing a score.
    const { extractSelectors, findDictionaryGaps } = await import('../src/patterns/selectors.js');
    for (const input of ['0x', '', '0xabc', '0xzz']) {
      expect(() => extractSelectors(input)).not.toThrow();
      expect(findDictionaryGaps(input, [], [])).toHaveLength(0);
    }
  });

  it('orders gaps deterministically', async () => {
    // The score has to be byte-identical across runs, so the list cannot come
    // out in Set iteration order.
    const { findDictionaryGaps } = await import('../src/patterns/selectors.js');
    const { selectorOf } = await import('../src/sources/keccak.js');
    const some = ['upgradeTo(address)', 'setOwner(address)', 'addMinter(address)', 'freeze(address)', 'setFee(uint256)'].map(selectorOf);

    const first = findDictionaryGaps(bytecodeWith(some), [], []);
    const second = findDictionaryGaps(bytecodeWith([...some].reverse()), [], []);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('a dictionary gap is reported but never scored', () => {
  const base = {
    chain: 'ethereum' as const,
    address: '0xtest',
    signals: [
      {
        capability: 'mint-authority' as const,
        state: 'ABSENT' as const,
        axis: 'control' as const,
        observations: [],
        reasoning: 'No mint authority found.',
      },
    ],
    disagreements: [],
    unverified: [],
    registryEntry: null,
    inputSnapshotHash: 'sha256:fixed',
    computedAt: '2026-08-05T00:00:00.000Z',
  };

  const gap = {
    surface: 'evm-selector' as const,
    selector: '0xd0e30db0',
    signature: 'setMinter(address)',
    capability: 'mint-authority' as const,
    note: 'unaccounted for, not absent',
  };

  it('moves no axis, no coverage figure and no signal state', async () => {
    // The boundary this feature is built on. Knowing a function exists is not
    // reading who holds it, and letting it move a number would be the guesswork
    // the dictionary exists to avoid.
    const { score } = await import('../src/scoring/model2.js');
    const without = score(base);
    const with_ = score({ ...base, dictionaryGaps: [gap] });

    expect(with_.axes.control.value).toBe(without.axes.control.value);
    expect(with_.axes.control.coverage).toEqual(without.axes.control.coverage);
    expect(with_.coverage).toEqual(without.coverage);
    expect(JSON.stringify(with_.axes)).toBe(JSON.stringify(without.axes));
  });

  it('says so in the limitations, where a reader will see it', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const result = score({ ...base, dictionaryGaps: [gap] });

    expect(result.dictionaryGaps).toHaveLength(1);
    expect(result.limitations[0]).toMatch(/no pattern in the dictionary reads/i);
    expect(result.limitations[0]).toMatch(/unaccounted for, not absent/i);
  });

  it('leaves a score with no gaps byte-identical to before the feature', async () => {
    // Nobody's published score may move because this shipped, beyond gaining an
    // empty list.
    const { score } = await import('../src/scoring/model2.js');
    const omitted = score(base);
    const explicitlyEmpty = score({ ...base, dictionaryGaps: [] });

    expect(JSON.stringify(omitted)).toBe(JSON.stringify(explicitlyEmpty));
    expect(omitted.dictionaryGaps).toEqual([]);
    expect(omitted.limitations[0]).not.toMatch(/no pattern in the dictionary reads/i);
  });

  it('stays inside the published contract', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const { parseScore } = await import('../src/scoring/schema.js');
    expect(() => parseScore(JSON.parse(JSON.stringify(score({ ...base, dictionaryGaps: [gap] }))))).not.toThrow();
  });
});

/**
 * Completeness of the privileged-function table.
 *
 * The table is a judgement call, and a capability missing from it becomes
 * silently undetectable — the same invisible-gap problem the module exists to
 * solve, one level up. These tests make the omission fail instead.
 */
describe('the privileged-function table covers every capability', () => {
  const ALL_CAPABILITIES = [
    'upgradeability',
    'mint-authority',
    'freeze-authority',
    'admin-authority',
    'metadata-mutability',
    'transfer-restriction',
    'fee-control',
  ] as const;

  it('accounts for every capability, by scanning for it or declaring it out of scope', async () => {
    const { privilegedFunctionTable } = await import('../src/patterns/selectors.js');
    const { functions, notScannedOnEvm: excluded } = privilegedFunctionTable();
    const scanned = new Set(functions.map((fn) => fn.capability));

    for (const capability of ALL_CAPABILITIES) {
      expect(
        scanned.has(capability) || excluded.has(capability),
        `${capability} is neither scanned for nor declared out of scope, so it can never produce a gap and nothing says why`
      ).toBe(true);
    }
  });

  it('matches the Capability union in types.ts', async () => {
    // Locks the list above against the code, so a capability added to the type
    // does not quietly slip past the completeness check.
    const { capabilitySchema } = await import('../src/scoring/schema.js');
    expect([...capabilitySchema.options].sort()).toEqual([...ALL_CAPABILITIES].sort());
  });

  it('uses canonical signatures', async () => {
    // A stray space, or `uint` instead of `uint256`, hashes to a different
    // selector. The table would look right and match nothing on chain.
    const { privilegedFunctionTable } = await import('../src/patterns/selectors.js');

    for (const { signature } of privilegedFunctionTable().functions) {
      expect(signature, `${signature} is not a canonical signature`).toMatch(
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\([a-z0-9,[\]]*\)$/
      );
      expect(signature, `${signature} contains a whitespace character`).not.toMatch(/\s/);
      expect(signature, `${signature} uses the uint/int alias rather than an explicit width`).not.toMatch(
        /\b(uint|int)\b(?![0-9])/
      );
    }
  });

  it('derives a distinct selector for every signature', async () => {
    // A collision would silently drop one entry from the lookup map.
    const { privilegedFunctionTable } = await import('../src/patterns/selectors.js');
    const { selectorOf } = await import('../src/sources/keccak.js');
    const selectors = privilegedFunctionTable().functions.map((fn) => selectorOf(fn.signature));
    expect(new Set(selectors).size).toBe(selectors.length);
  });
});

/**
 * Saying when we did not look.
 *
 * An empty `dictionaryGaps` meant two different things: we scanned and found
 * none, and we never scanned. The second happens on every Solana score and on
 * any EVM score whose bytecode fetch failed. Left unstated, "we could not
 * check" reads exactly like "we checked and it is clean".
 */
describe('an unscanned contract does not read as a clean one', () => {
  const base = {
    chain: 'ethereum' as const,
    address: '0xtest',
    signals: [],
    disagreements: [],
    unverified: [],
    registryEntry: null,
    inputSnapshotHash: 'sha256:fixed',
    computedAt: '2026-08-05T00:00:00.000Z',
  };

  it('says so when the bytecode could not be read', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const result = score({ ...base, gapScan: 'failed' });

    expect(result.gapScan).toBe('failed');
    expect(result.dictionaryGaps).toEqual([]);
    expect(result.limitations[0]).toMatch(/failed check, not a clean one/i);
  });

  it('says so on a chain where the scan does not apply', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const result = score({ ...base, chain: 'solana', gapScan: 'not-applicable' });

    expect(result.gapScan).toBe('not-applicable');
    expect(result.limitations[0]).toMatch(/we did not look, not that there is nothing/i);
  });

  it('stays quiet when the scan actually ran and found nothing', async () => {
    // The one case where an empty list is genuinely reassuring, and the only
    // one that should not carry a caveat.
    const { score } = await import('../src/scoring/model2.js');
    const result = score({ ...base, gapScan: 'ran' });

    expect(result.gapScan).toBe('ran');
    expect(result.limitations.join(' ')).not.toMatch(/did not look|failed check/i);
  });

  it('defaults to not-applicable rather than claiming a scan happened', async () => {
    // A caller that supplies nothing must not be reported as having scanned.
    const { score } = await import('../src/scoring/model2.js');
    expect(score(base).gapScan).toBe('not-applicable');
  });

  it('stays inside the published contract in every state', async () => {
    const { score } = await import('../src/scoring/model2.js');
    const { parseScore } = await import('../src/scoring/schema.js');

    for (const gapScan of ['ran', 'not-applicable', 'failed'] as const) {
      const wire = JSON.parse(JSON.stringify(score({ ...base, gapScan })));
      expect(() => parseScore(wire), `gapScan ${gapScan} must satisfy the contract`).not.toThrow();
    }
  });
});

/**
 * Documentation that cannot quietly go stale.
 *
 * METHODOLOGY.md §3 lists the capability-to-axis mapping, and LIMITATIONS.md
 * describes what the tool cannot see. Both were briefly wrong after 0.1.4
 * shipped, because the code gained an ability the prose still said it lacked.
 *
 * A document that overstates a blind spot is as misleading as one that hides
 * it, and this project's whole claim rests on its documents being true. These
 * read the files rather than trusting anyone to remember.
 */
describe('the documents match the code', () => {
  it('documents every capability in the axis mapping', async () => {
    const { readFile } = await import('node:fs/promises');
    const { capabilitySchema } = await import('../src/scoring/schema.js');
    const methodology = await readFile(join(REPO_ROOT, 'METHODOLOGY.md'), 'utf8');

    for (const capability of capabilitySchema.options) {
      expect(
        methodology.includes(capability),
        `METHODOLOGY.md does not mention ${capability}, so the published mapping is incomplete`
      ).toBe(true);
    }
  });

  it('documents the reported-not-scored fields the API now carries', async () => {
    // A consumer reading the docs must find these, since an empty
    // dictionaryGaps is only meaningful alongside gapScan.
    const { readFile } = await import('node:fs/promises');
    const methodology = await readFile(join(REPO_ROOT, 'METHODOLOGY.md'), 'utf8');

    expect(methodology).toMatch(/dictionaryGaps/);
    expect(methodology).toMatch(/gapScan/);
    expect(methodology).toMatch(/reported and never scored/i);
  });

  it('does not claim an undetected admin pattern is wholly invisible', async () => {
    // The pre-0.1.4 wording said we would "not know it happened". That is no
    // longer wholly true, and overstating a blind spot costs credibility on
    // the ones that are real.
    const { readFile } = await import('node:fs/promises');
    const limitations = await readFile(join(REPO_ROOT, 'LIMITATIONS.md'), 'utf8');

    expect(limitations).toMatch(/dictionaryGaps/);
    // ...while still admitting the residual gap, which has not gone away.
    expect(limitations).toMatch(/can still under-report its capabilities/i);
    // The scan stopped being EVM-only in 0.1.8, so the document must describe
    // both surfaces and must not claim the Solana one covers more than it does.
    expect(limitations).toMatch(/extension list/i);
    expect(limitations).toMatch(/outside what the extension list can tell us/i);
  });
});

/**
 * The gap census.
 *
 * METHODOLOGY.md §10 defers a decision — should a dictionary gap reduce
 * coverage? — until there are real numbers. The census produces them, so its
 * arithmetic is load-bearing on that decision. Wrong numbers here would argue
 * for the wrong answer, convincingly.
 *
 * The walk itself needs live RPC. `summarise` is pure and is what gets checked.
 */
describe('the gap census counts honestly', () => {
  const row = (over: Partial<import('../src/cli/census.js').TokenCensus> = {}) => ({
    id: 'x',
    chain: 'ethereum',
    symbol: 'X',
    gapScan: 'ran' as const,
    gapCount: 0,
    capabilities: [],
    signatures: [],
    ...over,
  });

  it('rates gaps against tokens actually scanned, not all tokens', async () => {
    // The distinction that matters. Solana entries are never scanned, so
    // including them in the denominator would halve the apparent rate and
    // argue against a change on the strength of tokens we never looked at.
    const { summarise } = await import('../src/cli/census.js');
    const summary = summarise([
      row({ gapCount: 2, capabilities: ['mint-authority'] }),
      row(),
      row({ chain: 'solana', gapScan: 'not-applicable' }),
      row({ chain: 'solana', gapScan: 'not-applicable' }),
    ]);

    expect(summary.tokens).toBe(4);
    expect(summary.scanned).toBe(2);
    expect(summary.notApplicable).toBe(2);
    expect(summary.withGaps).toBe(1);
    expect(summary.gapRate).toBe(0.5);
  });

  it('does not count an unreadable token as a clean one', async () => {
    // A token we could not read has no gaps recorded, which must never be
    // reported as having been scanned and found clean.
    const { summarise } = await import('../src/cli/census.js');
    const summary = summarise([
      row({ gapScan: 'failed' }),
      row({ gapScan: 'error', error: 'boom' }),
    ]);

    expect(summary.scanned).toBe(0);
    expect(summary.withGaps).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.errored).toBe(1);
    // No scanned tokens means no rate to report, not a rate of zero found.
    expect(summary.gapRate).toBe(0);
  });

  it('tallies gaps by capability across tokens', async () => {
    const { summarise } = await import('../src/cli/census.js');
    const summary = summarise([
      row({ gapCount: 2, capabilities: ['mint-authority', 'fee-control'] }),
      row({ gapCount: 1, capabilities: ['mint-authority'] }),
    ]);

    expect(summary.totalGaps).toBe(3);
    expect(summary.byCapability['mint-authority']).toBe(2);
    expect(summary.byCapability['fee-control']).toBe(1);
  });

  it('reports nothing rather than dividing by zero on an empty registry', async () => {
    const { summarise } = await import('../src/cli/census.js');
    const summary = summarise([]);
    expect(summary.gapRate).toBe(0);
    expect(Number.isNaN(summary.gapRate)).toBe(false);
  });
});


/**
 * The four tokens the dictionary-gap census caught.
 *
 * Each was a live false negative on mainnet: the contract exposes a privileged
 * function, no pattern read it, and the token scored as though the capability did
 * not exist. Three are now readable and locked here. The two that are not
 * readable are locked further down, so "we chose not to" cannot decay into
 * "we forgot".
 *
 * Every assertion below insists on a resolved value rather than merely a state
 * that is not ABSENT. An unreachable endpoint records `undefined`, which becomes
 * UNKNOWN, and UNKNOWN is not ABSENT — so the weaker assertion passes when
 * nothing was read at all. A regression lock that a total network failure
 * satisfies is not a lock.
 */

describeLive('MKR: the admin that predates Ownable', () => {
  it(
    'resolves the authority even though owner() finds nothing',
    async () => {
      const result = await analyse('ethereum', MKR_ETH);
      const signal = result.axes.control.signals.find((s) => s.capability === 'admin-authority');

      expect(signal).toBeDefined();
      // DSAuth permits a call if the caller is the owner OR if authority.canCall
      // approves it. Reading owner() alone on this token says "no admin".
      expect(signal!.state).not.toBe('ABSENT');

      const hit = signal!.observations.find((o) => o.patternId === 'admin-dsauth');
      expect(hit).toBeDefined();
      expect(String(hit!.value)).toMatch(/^0x[0-9a-f]{40}$/i);
    },
    TIMEOUT
  );
});

describeLive('WBTC: minting that cannot be finished', () => {
  it(
    'reports mint authority from a shape whose mint function cannot be called',
    async () => {
      const result = await analyse('ethereum', WBTC_ETH);
      const signal = result.axes.control.signals.find((s) => s.capability === 'mint-authority');

      expect(signal).toBeDefined();
      // mint(address,uint256) takes arguments and writes state, so it is
      // unreadable. mintingFinished() is the zero-argument tell for the same shape.
      expect(signal!.state).not.toBe('ABSENT');

      const hit = signal!.observations.find((o) => o.patternId === 'mint-oz-mintable');
      expect(hit).toBeDefined();
      // presenceIndicatedBy is call-success, so a successful read is recorded as
      // the mechanism being present. WBTC overrides finishMinting() to return
      // false without setting the flag, which makes the flag's VALUE the one
      // thing here that must never be mistaken for the answer.
      expect(String(hit!.value)).toMatch(/mechanism present/i);
    },
    TIMEOUT
  );
});

describeLive('ENS: a scheduled mint is still a mint', () => {
  it(
    'reports mint authority separately from who administers the token',
    async () => {
      const result = await analyse('ethereum', ENS_ETH);
      const mint = result.axes.control.signals.find((s) => s.capability === 'mint-authority');

      expect(mint).toBeDefined();
      // owner() already resolved admin-authority here. Supply is a different
      // capability on the same axis, and before mint-capped-schedule nothing
      // read it at all.
      expect(mint!.state).not.toBe('ABSENT');

      const hit = mint!.observations.find((o) => o.patternId === 'mint-capped-schedule');
      expect(hit).toBeDefined();
      expect(String(hit!.value)).toMatch(/mechanism present/i);
    },
    TIMEOUT
  );
});

describe('the gaps we chose not to close', () => {
  // DAI's wards is a mapping at slot 0 with no zero-argument getter, and MKR's
  // mint is gated by the DSAuth authority, which is not mint-specific: reading
  // authority() as mint authority would report a mint capability on every DSAuth
  // contract, including those with no mint function. Both stay gaps on purpose.
  // These assertions lock the reasoning rather than the outcome, so they need no
  // network and cannot rot when an endpoint is down.

  it('never treats a selector sitting in bytecode as a reading of the capability', async () => {
    // The shortcut this design refuses. A pattern matching mint(address,uint256)
    // in the bytecode would close every remaining gap at once and make
    // findDictionaryGaps return nothing by construction, deleting the instrument
    // that found these four tokens in the first place.
    const patterns = await loadPatterns();
    const selectors = patterns
      .map((p) => p.method.callSelector?.toLowerCase())
      .filter((s): s is string => typeof s === 'string');

    // mint(address,uint256) and setOwner(address). Both are write functions that
    // take arguments, so a pattern claiming to call either would be reading nothing.
    expect(selectors).not.toContain('0x40c10f19');
    expect(selectors).not.toContain('0x13af4035');
  });

  it('keeps both unreadable functions in the privileged table so they stay reported', async () => {
    // When a capability cannot be read, the gap scanner is the only thing between
    // it and silence. Deleting these entries to make the census look clean would
    // be the precise failure this project exists to prevent.
    const { privilegedFunctionTable } = await import('../src/patterns/selectors.js');
    const signatures = privilegedFunctionTable().functions.map((f) => f.signature);

    expect(signatures).toContain('mint(address,uint256)');
    expect(signatures).toContain('setOwner(address)');
  });

  it('reads every new pattern through a zero-argument getter', async () => {
    // The constraint that shaped all three patterns: applyEvmPatterns sends the
    // selector with no arguments, so a signature taking parameters would be
    // called with empty calldata and revert, and resolve.ts records a revert as
    // "function not present" — a false absence manufactured by our own reader.
    const patterns = await loadPatterns();

    for (const id of ['admin-dsauth', 'mint-oz-mintable', 'mint-capped-schedule']) {
      const pattern = patterns.find((p) => p.id === id);
      expect(pattern, `${id} should be loaded`).toBeDefined();
      expect(pattern!.method.signature).toMatch(/^\w+\(\)/);
    }
  });
});

/**
 * The guide has to keep up with the product.
 *
 * It is the one page written for someone who does not already know the
 * vocabulary, which makes it the page that hurts most when it falls behind: it
 * is wrong with the authority of documentation, and its reader is the one least
 * able to notice. Features will keep landing, so these hold the prose to what
 * the scorer actually emits rather than trusting anyone to remember.
 */
describe('the guide keeps up with the product', () => {
  const guidePath = join(REPO_ROOT, 'apps/web/app/guide/page.tsx');

  it('explains every state a signal can carry', async () => {
    const { readFile } = await import('node:fs/promises');
    const { signalStateSchema } = await import('../src/scoring/schema.js');
    const guide = await readFile(guidePath, 'utf8');

    for (const state of signalStateSchema.options) {
      expect(
        guide.includes(state),
        `the guide never explains ${state}, so a reader meets it first on a real report`
      ).toBe(true);
    }
  });

  it('names every axis a score is reported on', async () => {
    const { readFile } = await import('node:fs/promises');
    const { axisSchema } = await import('../src/scoring/schema.js');
    const guide = await readFile(guidePath, 'utf8');

    for (const axis of axisSchema.options) {
      expect(
        guide.toLowerCase().includes(axis),
        `the guide does not mention the ${axis} axis`
      ).toBe(true);
    }
  });

  it('counts the dictionary rather than stating a number that will rot', async () => {
    // The pattern count changes every time someone contributes one, which is
    // exactly the kind of fact that goes stale in prose and is never noticed.
    const { readFile } = await import('node:fs/promises');
    const guide = await readFile(guidePath, 'utf8');
    const patterns = await loadPatterns();

    expect(guide).toMatch(/patternCount/);
    expect(
      new RegExp(`There are ${patterns.length}\\b`).test(guide),
      'the guide hardcodes the current pattern count instead of counting it'
    ).toBe(false);
  });

  it('teaches the two distinctions the product exists to make', async () => {
    // Absence versus safety, and expected versus absent. A reader who misses
    // these misreads every report, however well the rest is written.
    const { readFile } = await import('node:fs/promises');
    const guide = await readFile(guidePath, 'utf8');

    expect(guide).toMatch(/absence is never safety/i);
    expect(guide).toMatch(/expected power is still a power/i);
    // n/a and 0 look alike and mean opposite things.
    expect(guide).toMatch(/n\/a/i);
  });
});

/**
 * Token-2022, where the extension list is the privileged surface.
 *
 * Before 0.1.8 the dictionary held one pattern for the whole of Token-2022. It
 * matched the entire extension array to fee-control, so on a mint carrying a
 * permanent delegate — an address that can move or burn any holder's balance —
 * Safegate reported a fee mechanism and said nothing at all about the delegate.
 * The reader was told the least severe true thing about the token while the most
 * severe one stayed invisible. These lock the shape that replaced it.
 */
describeLive('Token-2022: the extension list is the surface', () => {
  it('reads a permanent delegate on a real mainnet mint', async () => {
    const score = await analyse('solana', PYUSD_SOL);
    const signal = Object.values(score.axes)
      .flatMap((a) => a.signals)
      .find((s) => s.capability === 'transfer-restriction');

    expect(signal).toBeDefined();
    expect(signal!.state).toBe('PRESENT');
    // The resolved delegate, not merely "something was found". An assertion
    // that only ruled out ABSENT would pass on a transport failure, because a
    // failure resolves to UNKNOWN and UNKNOWN is not ABSENT.
    const found = signal!.observations.find((o) => o.patternId === 't2022-permanent-delegate');
    expect(found?.value).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  }, TIMEOUT);

  it('reports fee control on a mint whose fee is currently zero', async () => {
    // The Solana form of "expected power is still a power". PYUSD charges 0
    // basis points and holds a live authority that can raise it to 100%, two
    // epochs later. Scoring the rate rather than the authority would report no
    // fee control at all.
    const score = await analyse('solana', PYUSD_SOL);
    const signal = Object.values(score.axes)
      .flatMap((a) => a.signals)
      .find((s) => s.capability === 'fee-control');

    expect(signal?.state).toBe('PRESENT');
    expect(signal?.reasoning).toMatch(/mechanism present/i);
    // And the summary has to carry the actual configuration, not an object
    // rendered into the sentence a reader is meant to act on.
    expect(signal?.reasoning).not.toMatch(/\[object Object\]/);
  }, TIMEOUT);

  it('scans a legacy mint rather than declaring the question inapplicable', async () => {
    // A legacy Token mint's whole privileged surface is mintAuthority and
    // freezeAuthority, both of which the dictionary reads. "We scanned it and
    // there is nothing unread" is a stronger and truer statement than "this
    // chain has nothing to scan", which is what it used to say.
    const score = await analyse('solana', USDC_SOL);
    expect(score.gapScan).toBe('ran');
    expect(score.dictionaryGaps).toEqual([]);
  }, TIMEOUT);

  it('does not let a Token-2022 pattern make a finding about a legacy mint', async () => {
    // The regression this nearly shipped with. A Token-2022 pattern returning
    // "checked, not there" on a legacy mint flipped whole capabilities to
    // ABSENT on the strength of a check that could not have found anything —
    // and one definite miss outweighs any number of could-not-looks. USDC read
    // as having verified-absent metadata mutability while the Metaplex account,
    // the only place that answer lives, went unread.
    const score = await analyse('solana', USDC_SOL);
    const signals = Object.values(score.axes).flatMap((a) => a.signals);

    for (const signal of signals) {
      for (const observation of signal.observations) {
        expect(observation.patternId ?? '').not.toMatch(/^t2022-/);
      }
    }

    // Since 0.2.0 the Metaplex account is read, so metadata mutability resolves
    // through spl-update-authority rather than staying UNKNOWN.
    const metadata = signals.find((s) => s.capability === 'metadata-mutability');
    expect(metadata?.state).not.toBe('UNKNOWN');
    expect(metadata?.observations.some((o) => o.patternId === 'spl-update-authority' && o.value !== undefined)).toBe(true);
  }, TIMEOUT);
});

/**
 * The gap scanner on the Solana side, offline.
 *
 * These need no network: they are about what the scanner does with a list, and
 * the list is the input.
 */
describe('Token-2022 gaps: what we have never classified', () => {
  const mint = (...extensions: string[]) => ({
    data: { parsed: { info: { extensions: extensions.map((e) => ({ extension: e, state: {} })) } } },
  });

  it('reports an extension the dictionary has never heard of, with no capability named', async () => {
    // The failure this scanner exists to prevent, one level up. Token-2022
    // gains extension types regularly; skipping the ones we do not recognise
    // would guarantee that the newest power on a mint is the one we miss.
    const { findExtensionGaps } = await import('../src/patterns/extensions.js');
    const gaps = findExtensionGaps(mint('someExtensionShippedNextYear'), [], []);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.capability).toBeNull();
    expect(gaps[0]!.surface).toBe('solana-extension');
    expect(gaps[0]!.note).toMatch(/unread, not absent/i);
    // Naming a capability for it would be a guess, and a guess here is worse
    // than an admission.
    expect(gaps[0]!.note).toMatch(/never\s+classified/i);
  });

  it('reports an extension the node itself could not decode', async () => {
    const { findExtensionGaps } = await import('../src/patterns/extensions.js');
    const gaps = findExtensionGaps(mint('unparseableExtension'), [], []);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.capability).toBeNull();
    expect(gaps[0]!.note).toMatch(/could not decode/i);
  });

  it('says a Solana gap is switched on, not merely possible', async () => {
    // The wording carries a claim the EVM scanner cannot make. Bytecode says
    // the contract could do this; an extension list says the mint is set up to,
    // now. Collapsing the two would understate every Solana finding.
    const { findExtensionGaps } = await import('../src/patterns/extensions.js');
    const gaps = findExtensionGaps(mint('permanentDelegate'), [], []);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.note).toMatch(/switched on now/i);
  });

  it('stays quiet about an extension a pattern already reads', async () => {
    const { findExtensionGaps } = await import('../src/patterns/extensions.js');
    const patterns = [
      {
        id: 't2022-permanent-delegate',
        capability: 'transfer-restriction',
        chainFamily: 'solana',
        method: { kind: 'account-extension', extension: 'permanentDelegate' },
      },
    ] as unknown as Parameters<typeof findExtensionGaps>[1];

    expect(findExtensionGaps(mint('permanentDelegate'), patterns, [])).toHaveLength(0);
  });

  it('distinguishes a legacy mint from an unread one', async () => {
    // Neither has an extension list, and only one of them is a fact about the
    // token. A legacy mint has nothing to scan; an unread account was not
    // scanned. Both produce no gaps here, and the pipeline is what separates
    // them into 'ran' and 'failed'.
    const { findExtensionGaps, extensionNames } = await import('../src/patterns/extensions.js');
    expect(extensionNames(null)).toBeNull();
    expect(extensionNames({ data: { parsed: { info: {} } } })).toBeNull();
    expect(findExtensionGaps(null, [], [])).toEqual([]);
  });

  it('classifies every extension it knows about, or declares that it does not', async () => {
    // The same completeness rule selectors.ts holds itself to. An extension
    // that is neither mapped nor deliberately excluded would be silently
    // dropped, which is the invisible-gap problem this module exists to solve.
    const { mintExtensionTable, findExtensionGaps } = await import('../src/patterns/extensions.js');
    const { extensions, notACapability } = mintExtensionTable();

    const mapped = new Set(extensions.map((e) => e.extension));
    for (const name of notACapability) expect(mapped.has(name)).toBe(false);

    // Every mapped extension must actually produce a gap when nothing reads it.
    for (const e of extensions) {
      const gaps = findExtensionGaps(mint(e.extension), [], []);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]!.capability).toBe(e.capability);
    }

    // And every deliberately excluded one must produce none.
    for (const name of notACapability) {
      expect(findExtensionGaps(mint(name), [], [])).toHaveLength(0);
    }
  });

  it('keeps a pattern for every extension it claims to read', async () => {
    // A pattern naming an extension that is not in the table would read the
    // capability while the scanner went on reporting it as a gap, and the two
    // halves of the feature would disagree about the same mint.
    const { mintExtensionTable } = await import('../src/patterns/extensions.js');
    const { extensions } = mintExtensionTable();
    const known = new Set(extensions.map((e) => e.extension));

    const patterns = await loadPatterns();
    for (const p of patterns.filter((x) => x.method.kind === 'account-extension')) {
      expect(p.method.extension).toBeDefined();
      expect(known.has(p.method.extension!)).toBe(true);
      // And the pattern must agree with the table about what it means.
      const entry = extensions.find((e) => e.extension === p.method.extension);
      expect(p.capability).toBe(entry!.capability);
    }
  });
});

/**
 * PYUSD, the registry's first Token-2022 entry.
 *
 * Seeded because without it the whole Token-2022 path is dead code in CI: all
 * eight Solana entries before it use the legacy program, so every extension
 * pattern and the Solana gap scan would pass vacuously, which is exactly how
 * the WBTC lock came to pass while asserting nothing.
 */
describeLive('PYUSD: a registry entry that refuses to justify everything', () => {
  it('marks the two capabilities a fiat stablecoin cannot operate without', async () => {
    const score = await analyse('solana', PYUSD_SOL);
    const byCapability = Object.fromEntries(
      Object.values(score.axes)
        .flatMap((a) => a.signals)
        .map((s) => [s.capability, s])
    );

    expect(byCapability['mint-authority']!.state).toBe('EXPECTED');
    expect(byCapability['freeze-authority']!.state).toBe('EXPECTED');
  }, TIMEOUT);

  it('leaves the permanent delegate reported as a real power', async () => {
    // The entry's most consequential judgement, and the one most likely to be
    // softened later by someone who reads the issuer's justification and stops
    // there. The permanent delegate is documented and statutorily grounded and
    // would qualify on its own — but the transfer hook authority resolves the
    // same capability and is, in the issuer's own words, for "potential future
    // use". Marking the capability expected would stretch a legal justification
    // for seizure over an unexplained power to run arbitrary code on every
    // transfer, which is precisely the laundering the registry must not do.
    const score = await analyse('solana', PYUSD_SOL);
    const signal = Object.values(score.axes)
      .flatMap((a) => a.signals)
      .find((s) => s.capability === 'transfer-restriction');

    expect(signal!.state).toBe('PRESENT');
    expect(signal!.state).not.toBe('EXPECTED');
  }, TIMEOUT);

  it('justifies nothing it did not have to', async () => {
    // Four live powers on this mint have no justification recorded, three of
    // them described by the issuer as optionality rather than necessity. A
    // future edit that quietly adds them to expectedCapabilities would turn the
    // entry into the endorsement the registry is designed not to be.
    const entry = findEntry(await loadRegistry(), 'solana', PYUSD_SOL);
    expect(entry).toBeDefined();

    const expected = entry!.expectedCapabilities.map((c) => c.capability).sort();
    expect(expected).toEqual(['freeze-authority', 'mint-authority']);

    // And both justifications must say what limits the power, including where
    // nothing does.
    for (const c of entry!.expectedCapabilities) {
      expect(c.constrainedBy ?? '').not.toBe('');
    }
  });

  it('records that the powers were actually used, not merely held', async () => {
    // A registry entry that only describes what an issuer may do reads as
    // theory. This one carries the seizure transaction and the freeze count,
    // because "has exercised it" is the difference between a capability and a
    // practice, and it is the part a reader can check for themselves.
    const entry = findEntry(await loadRegistry(), 'solana', PYUSD_SOL);
    const onchain = entry!.evidence.filter((e) => e.kind === 'onchain');

    expect(onchain.length).toBeGreaterThanOrEqual(2);
    const text = JSON.stringify(entry);
    // The seizure transaction signature, so the claim is checkable.
    expect(text).toMatch(/2EoBhRCgGGo58z6tSnFQc7KJi6TyKNYXhnV7yZiQKdrs1d4UcqqrgwrAEwXye1Hnqs3ke7jWs5dM82DWhhZcwik/);
    // And the concentration finding, which is the entry's real subject.
    expect(text).toMatch(/1 of 4 signers|1 of 4/i);
  });
});

/**
 * 0.2.0 locks. Each one is a false reading the seed set produced on 0.1.8.
 */
describeLive('0.2.0: readings that were wrong on the seed set', () => {
  const WETH_ETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const GHO_ETH = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';
  const DEAD_ETH = '0x000000000000000000000000000000000000dEaD';
  const USDC_SOL_HOLDER = '3emsAVdmGKERbHjmGfQ6oZ1e35dkf5iYcS6U4CPKFVaa';

  it('does not read WETH9\'s catch-all fallback as a pause mechanism', async () => {
    // WETH9 answers every selector with empty data because its fallback is
    // deposit(). On 0.1.8 that read as paused() existing and WETH scored exit 100.
    const result = await analyse('ethereum', WETH_ETH);
    const pause = result.axes.exit.signals.find((s) => s.capability === 'transfer-restriction');
    expect(pause?.state).toBe('ABSENT');
    const mint = result.axes.control.signals.find((s) => s.capability === 'mint-authority');
    const viaFallback = mint?.observations.find((o) => o.patternId === 'mint-oz-mintable');
    expect(viaFallback?.value).toBeNull();
  }, TIMEOUT);

  it('reads USDC\'s blacklist as a freeze capability the registry expects', async () => {
    const result = await analyse('ethereum', USDC_ETH);
    const freeze = result.axes.control.signals.find((s) => s.capability === 'freeze-authority');
    expect(freeze?.state).toBe('EXPECTED');
    const hit = freeze?.observations.find((o) => o.patternId === 'freeze-blacklist');
    expect(hit?.value).toMatch(/mechanism present/);
    // Every capability the methodology defines is now in the denominator.
    expect(result.coverage.applicable).toBe(7);
  }, TIMEOUT);

  it('finds a role-based admin through DEFAULT_ADMIN_ROLE()', async () => {
    // The previous probe called hasRole(bytes32,address) with no arguments,
    // which always reverts, so no AccessControl token ever showed an admin.
    const result = await analyse('ethereum', GHO_ETH);
    const admin = result.axes.control.signals.find((s) => s.capability === 'admin-authority');
    expect(admin?.state).toBe('PRESENT');
    const hit = admin?.observations.find((o) => o.patternId === 'admin-accesscontrol');
    expect(hit?.value).toMatch(/mechanism present/);
  }, TIMEOUT);

  it('refuses to score an address with no contract', async () => {
    // Every probe on an empty address reads "checked, nothing there", which is
    // 0 on every axis at full coverage: the best result the tool can print.
    await expect(analyse('ethereum', DEAD_ETH)).rejects.toMatchObject({ reason: 'no-code' });
  }, TIMEOUT);

  it('refuses to score a Solana account that is not a mint', async () => {
    await expect(analyse('solana', USDC_SOL_HOLDER)).rejects.toMatchObject({ reason: 'not-a-mint' });
  }, TIMEOUT);

  it('reads Metaplex metadata mutability on a legacy mint', async () => {
    // Before 0.2.0 tokenMeta was never fetched, so this was UNKNOWN on every
    // Solana token and the methodology's claim that it fires on RAY was untrue.
    const result = await analyse('solana', RAY_SOL);
    const meta = result.axes.transparency.signals.find((s) => s.capability === 'metadata-mutability');
    expect(meta?.state).toBe('PRESENT');
    const hit = meta?.observations.find((o) => o.patternId === 'spl-update-authority');
    expect(hit?.value).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(result.axes.transparency.assessed).toBe(true);
  }, TIMEOUT);

  it('records extension-only capabilities as absent on a legacy mint, with the reason', async () => {
    const result = await analyse('solana', USDC_SOL);
    const fee = result.axes.exit.signals.find((s) => s.capability === 'fee-control');
    expect(fee?.state).toBe('ABSENT');
    expect(fee?.reasoning).toMatch(/legacy Token program/);
    expect(result.coverage.applicable).toBe(7);
  }, TIMEOUT);
});
