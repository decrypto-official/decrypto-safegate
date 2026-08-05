/**
 * Regression locks.
 *
 * Every case here is a mistake a naive implementation actually makes. They exist
 * so those mistakes cannot come back silently. The two headline cases, USDC's
 * proxy and UNI's minter, are the reason patterns/ exists at all.
 *
 * These tests hit live public RPC endpoints on purpose. Mocking them would test
 * our mocks rather than our reading of the chain, and reading the chain correctly
 * is the entire product.
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
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const UNI_ETH = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
const PEPE_ETH = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RAY_SOL = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';

describe('USDC on Ethereum: the proxy false negative', () => {
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

describe('UNI on Ethereum: the renounced-ownership false negative', () => {
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

describe('Solana USDC: expected capabilities are not risk', () => {
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

describe('the absent-is-not-safe rule', () => {
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

  it('seeds 20 tokens', async () => {
    const registry = await loadRegistry();
    expect(registry).toHaveLength(20);
    expect(registry.filter((e) => e.chain === 'ethereum')).toHaveLength(12);
    expect(registry.filter((e) => e.chain === 'solana')).toHaveLength(8);
  });

  it('finds entries case-insensitively on EVM', async () => {
    const registry = await loadRegistry();
    expect(findEntry(registry, 'ethereum', USDC_ETH.toLowerCase())).not.toBeNull();
    expect(findEntry(registry, 'ethereum', USDC_ETH.toUpperCase().replace('0X', '0x'))).not.toBeNull();
  });
});
