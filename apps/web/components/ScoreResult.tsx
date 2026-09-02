'use client';

import type { Score, Signal, Axis } from '@safegate/types.js';

/**
 * The result view.
 *
 * A bare score must be impossible to see. Every axis renders with its coverage
 * adjacent, every signal renders with its reasoning and its source, and the
 * limitations are on the page rather than behind a link. There is no compact
 * mode and no summary card, because those are what gets screenshotted as
 * "Safegate says safe".
 */

const AXES: Axis[] = ['control', 'transparency', 'exit'];

const AXIS_QUESTION: Record<Axis, string> = {
  control: 'How much do you have to trust them not to act against you?',
  transparency: 'How much can you check for yourself?',
  exit: 'If this goes bad, can you get out?',
};

function severity(value: number): string {
  if (value >= 60) return 'var(--present)';
  if (value >= 30) return 'var(--unknown)';
  return 'var(--absent)';
}

function truncate(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export function ScoreResult({ score }: { score: Score }) {
  const signals = AXES.flatMap((axis) => score.axes[axis].signals);
  const order = { PRESENT: 0, UNKNOWN: 1, EXPECTED: 2, ABSENT: 3 };
  const sorted = [...signals].sort((a, b) => order[a.state] - order[b.state]);

  const coveragePct = Math.round(score.coverage.ratio * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      {/* header */}
      <div className="panel">
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, letterSpacing: '-0.02em' }}>
              {score.symbol ?? 'Unknown token'}
              {score.name && score.name !== score.symbol && (
                <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 'var(--fs-lg)' }}>
                  {' '}
                  {score.name}
                </span>
              )}
            </div>
            <div className="addr">
              {score.chain} {truncate(score.address)}
            </div>
          </div>

          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            {score.registryEntry ? (
              <>
                <div className="tag" style={{ color: 'var(--expected)', borderColor: 'var(--expected)' }}>
                  registry: {score.registryEntry.archetype}
                </div>
                <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)', marginTop: 6 }}>
                  verified {score.registryEntry.verifiedAt} by {score.registryEntry.approvedBy}
                </div>
              </>
            ) : (
              /* Neutral, not a warning. Most legitimate tokens have no entry. */
              <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>
                No registry entry. Scored on structure alone.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="result-layout">
        {/* summary rail: a column beside the table when wide, a row across the
            full width when stacked */}
        <div className="summary-rail">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Axes</h2>
              <span className="tag">higher is worse</span>
            </div>
            <div className="panel-body">
              {AXES.map((axis) => {
                const a = score.axes[axis];

                // Nothing resolved is not a score of zero. Rendering 0 here would
                // make "we checked nothing" the best-looking result on the page.
                const assessed = a.assessed;

                return (
                  <div key={axis} style={{ marginBottom: 14 }}>
                    <div className="meter" style={{ marginBottom: 4 }}>
                      <span className="meter-label">{axis}</span>
                      <div className="meter-track">
                        {assessed && (
                          <div
                            className="meter-fill"
                            style={{ width: `${a.value}%`, background: severity(a.value) }}
                          />
                        )}
                      </div>
                      <span
                        className="meter-value"
                        style={{ color: assessed ? severity(a.value) : 'var(--unknown)' }}
                      >
                        {assessed ? a.value : 'n/a'}
                      </span>
                    </div>
                    {/* The coverage denominator is never separable from the value. */}
                    <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)', paddingLeft: 116 }}>
                      {assessed
                        ? `${a.coverage.scored}/${a.coverage.applicable} checks resolved`
                        : 'nothing resolved on this axis'}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Coverage</h2>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span
                  data-numeric
                  style={{
                    fontSize: 'var(--fs-display)',
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: coveragePct >= 80 ? 'var(--absent)' : coveragePct >= 60 ? 'var(--unknown)' : 'var(--present)',
                  }}
                >
                  {coveragePct}%
                </span>
                <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-dim)' }}>
                  {score.coverage.scored} of {score.coverage.applicable} applicable checks resolved
                </span>
              </div>
              <p
                style={{
                  fontSize: 'var(--fs-body)',
                  lineHeight: 'var(--lh-prose)',
                  color: 'var(--text-faint)',
                  margin: '12px 0 0',
                }}
              >
                Coverage measures how much of this token we could check. It is not a safety measure.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Incident history</h2>
            </div>
            <div className="panel-body">
              <div className="callout callout-warn">
                {typeof score.incident === 'string' ? (
                  <>
                    <strong style={{ color: 'var(--unknown)' }}>Insufficient data.</strong> Detecting what has
                    already gone wrong needs transaction history we do not yet read. This is not a clean record,
                    it is an absent one.
                  </>
                ) : (
                  <>{score.incident.flags.join(', ')}</>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* What the contract can do that no pattern reads. Placed above the
            signals table on purpose: a reader who stops at the signals would
            otherwise take an incomplete reading for a complete one. */}
        {score.dictionaryGaps.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Not read by any pattern</h2>
              <span className="tag">{score.dictionaryGaps.length} unaccounted for</span>
            </div>
            <div className="panel-body">
              <div className="callout callout-warn" style={{ marginBottom: 14 }}>
                <strong style={{ color: 'var(--unknown)' }}>This score is incomplete.</strong> The contract
                answers to these privileged functions, and no pattern in the dictionary reads them. That means
                we could not determine who holds them — not that nobody does. They are excluded from every
                axis and from the coverage figure.
              </div>

              {score.dictionaryGaps.map((gap) => (
                <div key={gap.selector} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span data-numeric style={{ fontSize: 'var(--fs-h)', fontWeight: 600, color: 'var(--unknown)' }}>
                      {gap.signature}
                    </span>
                    <span className="tag">{gap.capability}</span>
                    <span data-numeric style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>
                      {gap.selector}
                    </span>
                  </div>
                  <div className="reason" style={{ marginTop: 6 }}>
                    {gap.note}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* signals, taking all remaining width */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Signals</h2>
            <span className="tag">{sorted.length} capabilities checked</span>
          </div>
          <div className="findings">
            {sorted.map((signal) => (
              <SignalRow key={signal.capability} signal={signal} />
            ))}
          </div>
        </section>
      </div>

      {/* disagreements: loud by design */}
      {score.disagreements.length > 0 && (
        <section className="panel" style={{ borderColor: 'var(--unknown)' }}>
          <div className="panel-head">
            <h2 className="panel-title" style={{ color: 'var(--unknown)' }}>
              Source disagreements
            </h2>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
            {score.disagreements.map((d, i) => (
              <div key={i} className="callout callout-warn">
                <div className="mono" style={{ color: 'var(--text)', marginBottom: 6 }}>
                  {d.capability}
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span>
                    ours ({d.ours.source}): <span className="mono">{JSON.stringify(d.ours.value)}</span>
                  </span>
                  <span>
                    {d.theirs.source}: <span className="mono">{JSON.stringify(d.theirs.value)}</span>
                  </span>
                </div>
                <div className="reason">{d.note}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* third-party values, visually separated so they can never read as ours */}
      {score.unverified.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title" style={{ color: 'var(--expected)' }}>
              Not independently verified
            </h2>
            <span className="tag">shown for reference, excluded from the score</span>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
            {score.unverified.map((u, i) => (
              <div key={i} className="callout callout-info">
                <div style={{ marginBottom: 6 }}>
                  <strong style={{ color: 'var(--text)' }}>{u.label}:</strong>{' '}
                  {u.value === null ? (
                    <span style={{ color: 'var(--unknown)' }}>unknown from our side</span>
                  ) : (
                    <span className="mono">{JSON.stringify(u.value)}</span>
                  )}{' '}
                  <span className="tag">via {u.source}</span>
                </div>
                <div className="reason">{u.caveat}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* limitations: on the page, not behind a link */}
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">What this cannot tell you</h2>
        </div>
        <div className="panel-body">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {score.limitations.map((l, i) => (
              <li key={i} className="reason">
                {l}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
        methodology {score.methodologyVersion} &nbsp; snapshot {score.inputSnapshotHash} &nbsp;{' '}
        {score.computedAt}
      </div>
    </div>
  );
}

/**
 * One capability, read.
 *
 * This was a table row whose fifth cell held a paragraph. A table asks the eye
 * to compare values down a column, which is the right shape for the state, the
 * capability and the axis, and the wrong shape for the reasoning: prose does
 * not compare downward, and it was being fitted into whatever width the four
 * fixed columns left, at 12px.
 *
 * The scannable fields now sit on one line with the state first, so the states
 * still form a single column the eye can run down, and the reasoning sits under
 * them at full prose size and measure. It is always visible. Reasoning behind a
 * disclosure control would make a bare score obtainable by collapsing it, and
 * that is the one thing this product refuses to allow.
 */
function SignalRow({ signal }: { signal: Signal }) {
  const hit = signal.observations.find((o) => o.value !== null && o.value !== undefined);

  return (
    <article className="finding">
      <div className="finding-head">
        <span className={`state state-${signal.state} finding-state`}>{signal.state}</span>
        <span className="finding-cap">{signal.capability}</span>
        <span className="finding-meta">
          <span>{signal.axis}</span>
          {/* Provenance travels with every value. */}
          {hit?.patternId ? <span className="tag">{hit.patternId}</span> : <span>no source</span>}
        </span>
      </div>
      <p className="reason" style={{ margin: 0 }}>
        {signal.reasoning}
      </p>
    </article>
  );
}
