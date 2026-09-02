'use client';

import { useState } from 'react';
import { selectableRow } from './selectableRow';
import type { Pattern } from '@safegate/patterns/resolve.js';

/**
 * The dictionary browser.
 *
 * `knownFalseNegative` gets the most prominent treatment on this page, which is
 * deliberate. It is the field that says "relying on this pattern alone will
 * mislead you", and those warnings are worth more than the patterns themselves.
 */

export function PatternBrowser({ patterns }: { patterns: Pattern[] }) {
  const [selectedId, setSelectedId] = useState(patterns[0]?.id ?? '');
  const [familyFilter, setFamilyFilter] = useState<'all' | 'evm' | 'solana'>('all');

  const visible = patterns.filter((p) => familyFilter === 'all' || p.chainFamily === familyFilter);
  const selected = patterns.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="master-detail">
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Patterns</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'evm', 'solana'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className="tag"
                aria-pressed={familyFilter === f}
                onClick={() => setFamilyFilter(f)}
                style={{
                  cursor: 'pointer',
                  background: familyFilter === f ? 'var(--surface-raised)' : 'transparent',
                  color: familyFilter === f ? 'var(--text)' : 'var(--text-faint)',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          {/* role="grid" so a row may be focusable and selectable. Putting
              role="button" on the <tr> instead overrode its row role, which
              collapsed the cells into one flat button label and threw away the
              column headers — breaking the table semantics that were the whole
              reason for keeping a table. */}
          <table className="table" role="grid" style={{ minWidth: 0 }}>
            <colgroup>
              <col />
<col className="c-capability" />
              <col style={{ width: 30 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Capability</th>
                <th style={{ textAlign: 'right' }} title="has a documented false negative">
                  !
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((pattern) => (
                <tr
                  key={pattern.id}
                  {...selectableRow(pattern.id === selected?.id, () => setSelectedId(pattern.id))}
                >
                  <td className="mono" style={{ color: 'var(--text)', overflowWrap: 'anywhere' }}>
                    {pattern.id}
                  </td>
                  {/* No overflowWrap here. `anywhere` breaks at any character,
                      and capability names have no hyphen to break at, so
                      `upgradeability` rendered as `upgradeabili/ty`. */}
                  <td style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-meta)' }}>
                    {pattern.capability}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-faint)' }}>
                    {pattern.knownFalseNegative ? (
                      <abbr title="documents a known false negative">!</abbr>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && <PatternDetail pattern={selected} />}
    </div>
  );
}

function PatternDetail({ pattern }: { pattern: Pattern }) {
  const m = pattern.method;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)', minWidth: 0 }}>
      <section className="panel">
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div className="mono" style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)' }}>
              {pattern.id}
            </div>
            <span className="tag">{pattern.chainFamily}</span>
            <span className="tag" style={{ color: 'var(--expected)' }}>
              {pattern.capability}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>
              added {pattern.addedAt}
              {pattern.addedBy ? ` by ${pattern.addedBy}` : ''}
            </span>
          </div>
          {pattern.title && (
            <div style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-body)', marginTop: 4 }}>{pattern.title}</div>
          )}
          <p className="reason" style={{ margin: '10px 0 0' }}>
            {pattern.detects}
          </p>
        </div>
      </section>

      {/* The warning outranks the mechanics. */}
      {pattern.knownFalseNegative && (
        <div className="callout callout-warn">
          <strong style={{ color: 'var(--unknown)' }}>Known false negative.</strong>
          <div className="reason" style={{ marginTop: 4 }}>
            {pattern.knownFalseNegative}
          </div>
        </div>
      )}

      <div className="grid-fluid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">How it reads</h2>
            <span className="tag">{m.kind}</span>
          </div>
          <div className="panel-body">
            <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
              {m.storageSlot && (
                <Field label="Storage slot">
                  <span className="mono" style={{ wordBreak: 'break-all', fontSize: 'var(--fs-meta)' }}>
                    {m.storageSlot}
                  </span>
                  {m.slotDerivation && (
                    <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)', marginTop: 3 }}>
                      {m.slotDerivation}
                    </div>
                  )}
                </Field>
              )}
              {m.callSelector && (
                <Field label="Selector">
                  <span className="mono">{m.callSelector}</span>
                  {m.signature && (
                    <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)', marginTop: 3 }}>{m.signature}</div>
                  )}
                </Field>
              )}
              {m.accountField && (
                <Field label="Account field">
                  <span className="mono" style={{ fontSize: 'var(--fs-meta)' }}>
                    {m.accountField}
                  </span>
                </Field>
              )}
              <Field label="Return type">
                <span className="mono">{m.returnType}</span>
              </Field>
              <Field label="Presence decided by">
                <span className="mono">{pattern.presenceIndicatedBy ?? 'non-empty-value'}</span>
                <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)', marginTop: 3 }}>
                  {pattern.presenceIndicatedBy === 'call-success'
                    ? 'The function existing proves the capability exists, whatever it returns.'
                    : 'The returned value decides. A zero address means genuinely renounced.'}
                </div>
              </Field>
            </dl>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Why this exists</h2>
          </div>
          <div className="panel-body">
            <p className="reason" style={{ margin: 0 }}>
              {pattern.rationale}
            </p>
            {pattern.references && pattern.references.length > 0 && (
              <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                {pattern.references.map((r) => (
                  <a key={r} href={r} target="_blank" rel="noreferrer noopener" style={{ fontSize: 'var(--fs-meta)' }}>
                    {r.replace(/^https?:\/\//, '').slice(0, 70)}
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {pattern.coversExamples && pattern.coversExamples.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Verified against</h2>
            <span className="tag">these are the regression fixtures</span>
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <colgroup>
                <col style={{ width: 92 }} />
                <col style={{ width: 100 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Chain</th>
                  <th>Observed</th>
                </tr>
              </thead>
              <tbody>
                {pattern.coversExamples.map((ex) => (
                  <tr key={`${ex.chain}-${ex.address}`}>
                    <td className="mono" style={{ color: 'var(--text)' }}>
                      {ex.symbol}
                    </td>
                    <td style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>{ex.chain}</td>
                    <td className="reason">
                      {ex.observed ?? '.'}
                      <div className="addr" style={{ fontSize: 'var(--fs-label)', marginTop: 3 }}>
                        {ex.address}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 'var(--fs-label)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-faint)',
          marginBottom: 3,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 'var(--fs-body)' }}>{children}</dd>
    </div>
  );
}
