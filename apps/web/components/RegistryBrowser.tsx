'use client';

import { useState } from 'react';
import { selectableRow } from './selectableRow';
import type { RegistryEntry } from '@safegate/registry/lookup.js';

/**
 * The accountability surface.
 *
 * A registry entry lowers a token's score, which makes it exactly the mechanism
 * a bad actor would want to abuse. So every entry shows its evidence, its named
 * approver, its review date and its caveats. Nothing here is summarised away.
 */

export function RegistryBrowser({ entries }: { entries: RegistryEntry[] }) {
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? '');
  const [chainFilter, setChainFilter] = useState<'all' | 'ethereum' | 'solana'>('all');

  const visible = entries.filter((e) => chainFilter === 'all' || e.chain === chainFilter);
  const selected = entries.find((e) => e.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="master-detail">
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Entries</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'ethereum', 'solana'] as const).map((c) => (
              <button
                key={c}
                className="tag"
                onClick={() => setChainFilter(c)}
                style={{
                  cursor: 'pointer',
                  background: chainFilter === c ? 'var(--surface-raised)' : 'transparent',
                  color: chainFilter === c ? 'var(--text)' : 'var(--text-faint)',
                }}
              >
                {c}
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
              <col style={{ width: 86 }} />
              <col />
              <col style={{ width: 46 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Token</th>
                <th>Archetype</th>
                <th style={{ textAlign: 'right' }} title="expected capabilities declared">
                  Exp.
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr
                  key={entry.id}
                  {...selectableRow(entry.id === selected?.id, () => setSelectedId(entry.id))}
                >
                  <td className="mono" style={{ color: 'var(--text)' }}>
                    {entry.symbol}
                    <div style={{ fontSize: 'var(--fs-label)', color: 'var(--text-faint)' }}>{entry.chain}</div>
                  </td>
                  {/* No overflowWrap: it breaks mid-word, and archetypes like
                      `crypto-collateralised-stablecoin` should break at their
                      hyphens instead. */}
                  <td style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-meta)' }}>
                    {entry.archetype}
                  </td>
                  <td data-numeric style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                    {entry.expectedCapabilities.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && <EntryDetail entry={selected} />}
    </div>
  );
}

function EntryDetail({ entry }: { entry: RegistryEntry }) {
  const overdue = entry.reviewDue ? new Date(entry.reviewDue) < new Date() : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)', minWidth: 0 }}>
      <section className="panel">
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', letterSpacing: '-0.02em' }}>
                {entry.symbol}{' '}
                <span style={{ color: 'var(--text-dim)', fontWeight: 'var(--fw-normal)', fontSize: 'var(--fs-body)' }}>{entry.name}</span>
              </div>
              <div className="addr">
                {entry.chain} {entry.address}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>
              <div className="tag">{entry.archetype}</div>
              <div style={{ marginTop: 4 }}>
                verified {entry.verifiedAt} by {entry.approvedBy}
              </div>
              {entry.reviewDue && (
                <div style={{ color: overdue ? 'var(--unknown)' : 'var(--text-faint)' }}>
                  {overdue ? 'review OVERDUE since' : 'review due'} {entry.reviewDue}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 'var(--fs-body)' }}>
            <span style={{ color: 'var(--text-dim)' }}>
              Issuer: <span style={{ color: 'var(--text)' }}>{entry.issuer.name}</span>
            </span>
            {entry.issuer.jurisdiction && (
              <span style={{ color: 'var(--text-dim)' }}>{entry.issuer.jurisdiction}</span>
            )}
            <span className="tag" style={entry.issuer.regulated ? { color: 'var(--expected)' } : undefined}>
              {entry.issuer.regulated ? 'regulated issuer' : 'not a regulated issuer'}
            </span>
            {entry.issuer.website && (
              <a href={entry.issuer.website} target="_blank" rel="noreferrer noopener" style={{ fontSize: 'var(--fs-body)' }}>
                {entry.issuer.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* The disclosure sits high on the page, not buried at the bottom. */}
      <div className={entry.commercialRelationship ? 'callout callout-warn' : 'callout'}>
        <strong style={{ color: entry.commercialRelationship ? 'var(--unknown)' : 'var(--text)' }}>
          Commercial relationship:
        </strong>{' '}
        {entry.commercialRelationship ?? 'none declared with this issuer.'}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Expected capabilities</h2>
          <span className="tag">{entry.expectedCapabilities.length} declared</span>
        </div>
        <div className="panel-body">
          {entry.expectedCapabilities.length === 0 ? (
            <p className="reason" style={{ margin: 0 }}>
              None. No capability is pre-approved for this token, so it is scored on structure alone. Being in
              the registry confirms identity and archetype, and grants no exemption.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {entry.expectedCapabilities.map((cap) => (
                <div key={cap.capability} className="callout callout-info">
                  <div className="mono" style={{ color: 'var(--expected)', marginBottom: 4 }}>
                    {cap.capability}
                  </div>
                  <div className="reason" style={{ marginBottom: cap.constrainedBy ? 6 : 0 }}>
                    {cap.justification}
                  </div>
                  {cap.constrainedBy && (
                    <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>
                      Constrained by: {cap.constrainedBy}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid-fluid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Evidence</h2>
            <span className="tag">{entry.evidence.length} items</span>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            {entry.evidence.map((ev, i) => (
              <div key={i}>
                <span className="tag" style={{ marginRight: 6 }}>
                  {ev.kind}
                </span>
                {ev.observedAt && (
                  <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>{ev.observedAt}</span>
                )}
                <div className="reason" style={{ marginTop: 4 }}>
                  {ev.detail}
                </div>
                {ev.url && (
                  <a href={ev.url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 'var(--fs-meta)' }}>
                    {ev.url.replace(/^https?:\/\//, '').slice(0, 60)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        {entry.caveats && entry.caveats.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">What this entry does not mean</h2>
            </div>
            <div className="panel-body">
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                {entry.caveats.map((c, i) => (
                  <li key={i} className="reason">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
