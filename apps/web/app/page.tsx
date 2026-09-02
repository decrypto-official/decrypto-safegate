'use client';

import { useState } from 'react';
import type { Score } from '@safegate/types.js';
import { ScoreResult } from '@/components/ScoreResult';

const EXAMPLES = [
  {
    chain: 'solana' as const,
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    label: 'USDC',
    why: 'mint and freeze both live, and expected',
  },
  {
    chain: 'ethereum' as const,
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    label: 'UNI',
    why: 'owner() reverts, minter() does not',
  },
  {
    chain: 'ethereum' as const,
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    label: 'USDC',
    why: 'a proxy the standard slot misses',
  },
  {
    chain: 'solana' as const,
    address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    label: 'JitoSOL',
    why: 'must mint to function at all',
  },
];

export default function LookupPage() {
  const [chain, setChain] = useState<'ethereum' | 'solana'>('solana');
  const [address, setAddress] = useState('');
  const [score, setScore] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(nextChain: 'ethereum' | 'solana', nextAddress: string) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
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
                onChange={(e) => setChain(e.target.value as 'ethereum' | 'solana')}
                aria-label="Chain"
              >
                <option value="solana">solana</option>
                <option value="ethereum">ethereum</option>
              </select>
              <input
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={
                  chain === 'ethereum' ? '0x... contract address' : 'mint address'
                }
                aria-label="Token address"
                spellCheck={false}
              />
              <button className="btn" type="submit" disabled={loading || !address.trim()}>
                {loading ? 'reading chain...' : 'Analyse'}
              </button>
            </div>
          </form>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={`${ex.chain}-${ex.address}`}
                className="tag"
                style={{ cursor: 'pointer', background: 'transparent' }}
                onClick={() => {
                  setChain(ex.chain);
                  setAddress(ex.address);
                  void lookup(ex.chain, ex.address);
                }}
                title={ex.why}
              >
                {ex.label} <span style={{ opacity: 0.6 }}>{ex.chain}</span>
              </button>
            ))}
          </div>
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

      {/* Live region so a screen reader learns the result arrived. */}
      <div aria-live="polite" aria-atomic="true">
        {score && <ScoreResult score={score} />}
      </div>

      {!score && !loading && !error && (
        <section className="panel">
          <div className="panel-body">
            <h1 style={{ fontSize: 'var(--fs-xl)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              What can this token actually do to you?
            </h1>
            <p className="reason" style={{ margin: '0 0 16px' }}>
              Safegate reads a token&apos;s structure straight from the chain and reports which powers exist,
              who holds them, and whether anything justifies them. It always tells you how much it was able to
              check. It never tells you a token is safe, because structure cannot answer that.
            </p>

            <div className="grid-fluid">
              <div className="callout">
                <strong style={{ color: 'var(--text)' }}>Absence is never safety.</strong>
                <br />
                If a check could not resolve, it reads{' '}
                <span className="state state-UNKNOWN" style={{ display: 'inline-flex' }}>
                  UNKNOWN
                </span>{' '}
                and the coverage figure drops. It never quietly counts as clean.
              </div>
              <div className="callout">
                <strong style={{ color: 'var(--text)' }}>An expected power is still a power.</strong>
                <br />
                Circle can freeze your USDC. The registry explains why that capability exists. It does not
                pretend it is absent.
              </div>
              <div className="callout">
                <strong style={{ color: 'var(--text)' }}>Reproducible by anyone.</strong>
                <br />
                The method and weights are published, and the scorer is a pure function. You can recompute any
                score without asking us.
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
