'use client';

import { useState } from 'react';
import type { Score } from '@safegate/types.js';
import { ScoreResult } from '@/components/ScoreResult';
import { vars } from '@/components/vars';

type Chain = 'ethereum' | 'solana';

const EXAMPLES: Array<{ chain: Chain; address: string; label: string; why: string }> = [
  {
    chain: 'solana',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    label: 'USDC',
    why: 'mint and freeze both live, and expected',
  },
  {
    chain: 'ethereum',
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    label: 'UNI',
    why: 'owner() reverts, minter() does not',
  },
  {
    chain: 'ethereum',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    label: 'USDC',
    why: 'a proxy the standard slot misses',
  },
  {
    chain: 'solana',
    address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    label: 'JitoSOL',
    why: 'must mint to function at all',
  },
];

export default function LookupPage() {
  const [chain, setChain] = useState<Chain>('solana');
  const [address, setAddress] = useState('');
  const [score, setScore] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const idle = !score && !loading && !error;

  async function lookup(nextChain: Chain, nextAddress: string) {
    if (!nextAddress.trim()) return;
    setLoading(true);
    setError(null);
    setScore(null);

    try {
      const response = await fetch(
        `/api/score?chain=${nextChain}&address=${encodeURIComponent(nextAddress.trim())}`
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'lookup failed');
      } else {
        setScore(body as Score);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function run(ex: (typeof EXAMPLES)[number]) {
    setChain(ex.chain);
    setAddress(ex.address);
    void lookup(ex.chain, ex.address);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      {/* A 2px accent sweep under the topbar while the chain is being read.
          It stops the moment a result or an error lands. */}
      {loading && <div className="readline" role="progressbar" aria-label="reading chain" />}

      <section className="panel">
        <div className="panel-body">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(chain, address);
            }}
          >
            <div className="field">
              <select
                className="select"
                value={chain}
                onChange={(e) => setChain(e.target.value as Chain)}
                aria-label="Chain"
              >
                <option value="solana">solana</option>
                <option value="ethereum">ethereum</option>
              </select>
              <input
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={chain === 'ethereum' ? '0x... contract address' : 'mint address'}
                aria-label="Token address"
                spellCheck={false}
              />
              <button className="btn" type="submit" disabled={loading || !address.trim()}>
                {loading ? 'reading chain...' : 'Analyse'}
              </button>
            </div>
          </form>

          {/* Once a reader is working, the examples shrink to a row of chips so
              the next lookup is one click away without a panel in the way. */}
          {!idle && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>try:</span>
              {EXAMPLES.map((ex) => (
                <button key={`${ex.chain}-${ex.address}`} type="button" className="tag" onClick={() => run(ex)} title={ex.why}>
                  {ex.label} <span style={{ opacity: 0.6 }}>{ex.chain}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {error && (
        <div className="callout callout-warn" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="result-layout">
          <div className="panel">
            <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
              <div className="skeleton" style={{ height: 14, width: '70%' }} />
              <div className="skeleton" style={{ height: 14, width: '55%' }} />
              <div className="skeleton" style={{ height: 14, width: '62%' }} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton" style={{ height: 14 }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Live region so a screen reader learns the result arrived. Keyed on the
          snapshot so a new result remounts and its figures draw in again. */}
      <div aria-live="polite" aria-atomic="true">
        {score && <ScoreResult key={`${score.inputSnapshotHash}-${score.computedAt}`} score={score} />}
      </div>

      {idle && (
        <div className="home-grid">
          <section className="panel enter">
            <div className="panel-body">
              <h1 style={{ fontSize: 'var(--fs-xl)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                What can this token actually do to you?
              </h1>
              <p className="reason" style={{ margin: '0 0 16px' }}>
                Safegate reads a token&apos;s structure straight from the chain and reports which powers exist,
                who holds them, and whether anything justifies them. It always tells you how much it was able to
                check. It never tells you a token is safe, because structure cannot answer that.
              </p>

              <dl className="rules">
                <div>
                  <dt>Absence is never safety.</dt>
                  <dd>
                    If a check could not resolve, it reads{' '}
                    <span className="state state-UNKNOWN" style={{ display: 'inline-flex' }}>
                      UNKNOWN
                    </span>{' '}
                    and the coverage figure drops. It never quietly counts as clean.
                  </dd>
                </div>
                <div>
                  <dt>An expected power is still a power.</dt>
                  <dd>
                    Circle can freeze your USDC. The registry explains why that capability exists. It does not
                    pretend it is absent.
                  </dd>
                </div>
                <div>
                  <dt>Reproducible by anyone.</dt>
                  <dd>
                    The method and weights are published, and the scorer is a pure function. You can recompute
                    any score without asking us.
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Four real tokens, each chosen because it breaks a naive reading.
              Cards rather than chips here: the reason each one is worth a
              click is the point, and it needs a line of its own. */}
          <section className="panel enter" style={vars({ '--i': 1 })}>
            <div className="panel-head">
              <h2 className="panel-title">Try one</h2>
              <span className="tag">reads mainnet, no key</span>
            </div>
            <div className="panel-body examples">
              {EXAMPLES.map((ex) => (
                <button
                  key={`${ex.chain}-${ex.address}`}
                  type="button"
                  className="example-card"
                  data-action="score"
                  onClick={() => run(ex)}
                >
                  <span className="mono" style={{ fontSize: 'var(--fs-h)', fontWeight: 'var(--fw-bold)' }}>
                    {ex.label}
                  </span>
                  <span className="tag">{ex.chain}</span>
                  <span className="why">{ex.why}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
