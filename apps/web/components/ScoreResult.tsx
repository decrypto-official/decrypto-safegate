'use client';

import type { Score, Signal, Axis } from '@safegate/types.js';
import { AxesRadar, CoverageRing, severity } from './Figures';

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

function truncate(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export function ScoreResult({ score }: { score: Score }) {
  const signals = AXES.flatMap((axis) => score.axes[axis].signals);
  const order = { PRESENT: 0, UNKNOWN: 1, EXPECTED: 2, ABSENT: 3 };
  const sorted = [...signals].sort((a, b) => order[a.state] - order[b.state]);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      {/* header */}
      <div className="panel">
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'baseline' }}>
          <div>
            {/* An h1, not a div. The only h1 on this route lived in the
                pre-search intro and unmounted as soon as a score arrived, so
                the result view had no h1 at all and the token's name — the most
                important word on the page — was not a heading. Navigating by
                heading landed on "Axes" and "Signals" without ever announcing
                which token was being read. */}
            <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
              {score.symbol ?? 'Unknown token'}
              {score.name && score.name !== score.symbol && (
                <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 'var(--fs-lg)' }}>
                  {' '}
                  {score.name}
                </span>
              )}
            </h1>
            <div className="addr">
              {score.chain} {truncate(score.address)}
            </div>
          </div>

          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            {score.registryEntry ? (
              <>
                {/* Plain. Tinted with --expected this was the most saturated
                    shape above the fold, so the first thing the eye reached on
                    a risk report was a piece of provenance metadata rather than
                    the axes. --expected also means a specific thing about a
                    capability, and this is not one. */}
                <div className="tag">registry: {score.registryEntry.archetype}</div>
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
              {/* The shape at a glance, the numbers underneath. A three-point
                  radar cannot be read precisely on its own — you see a
                  silhouette, not a value — so it never appears without the
                  labelled bars. */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <AxesRadar score={score} />
              </div>
              {AXES.map((axis) => {
                const a = score.axes[axis];

                // Nothing resolved is not a score of zero. Rendering 0 here would
                // make "we checked nothing" the best-looking result on the page.
                const assessed = a.assessed;

                return (
                  <div key={axis} style={{ marginBottom: 14 }}>
                    <div className="meter" style={{ marginBottom: 4 }}>
                      <span className="meter-label">{axis}</span>
                      {/* An unassessed axis gets a hatched track, not an empty
                          one. Empty read identically to a genuine zero: Exit
                          scoring 0 (we checked, nothing found) and Transparency
                          resolving nothing produced the same flat grey bar, and
                          the bar is the element with the most visual weight per
                          axis. Anyone scanning bars rather than numbers could
                          not tell "confirmed clear" from "we know nothing". */}
                      <div className={assessed ? 'meter-track' : 'meter-track meter-track-unread'}>
                        {assessed && (
                          <div
                            className="meter-fill"
                            style={{ width: `${a.value}%`, background: severity(a.value) }}
                          />
                        )}
                      </div>
                      {/* n/a is neutral, never amber. --unknown means "we could
                          not check this capability"; reusing it for an
                          unassessed axis put "nothing resolved" in the same
                          colour as Control's resolved 50, so the two read as
                          the same severity band at a glance. */}
                      <span
                        className="meter-value"
                        style={{ color: assessed ? severity(a.value) : 'var(--text-faint)' }}
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
              <CoverageRing scored={score.coverage.scored} applicable={score.coverage.applicable} />
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

        <div className="result-main">
        {/* What the contract can do that no pattern reads. Placed above the
            signals list on purpose: a reader who stops at the signals would
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
          <div className="table-wrap">
            <table className="table signals">
              <caption className="visually-hidden">
                Every capability checked on this token, with the state we read, the axis it scores on, the
                pattern that read it, and the reasoning.
              </caption>
              <colgroup>
                <col className="c-state" />
                <col className="c-cap" />
                <col className="c-axis" />
                <col className="c-src" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">State</th>
                  <th scope="col">Capability</th>
                  <th scope="col">Axis</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              {sorted.map((signal) => (
                <SignalRow key={signal.capability} signal={signal} />
              ))}
            </table>
          </div>
        </section>
        </div>
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
 * One capability, read. Two rows, one signal.
 *
 * The design spec asks for a table here, one row per signal, with real table
 * markup and scoped headers. A previous pass replaced it with a list of
 * articles, which fixed a genuine problem — the reasoning was a multi-sentence
 * paragraph crushed into the fifth column of five, at whatever width the four
 * fixed columns left over — and broke both rules to do it.
 *
 * Two rows per signal satisfies all of it. The scannable fields stay a real
 * table the eye can read down a column and a screen reader can navigate by
 * header. The reasoning spans the full width underneath, at prose size and
 * measure, always visible: reasoning behind a disclosure control is a bare
 * score waiting to be screenshotted, which is the one thing the spec's first
 * and highest rule forbids.
 *
 * Each pair is grouped in its own tbody so the two rows are one record.
 */
function SignalRow({ signal }: { signal: Signal }) {
  const hit = signal.observations.find((o) => o.value !== null && o.value !== undefined);

  return (
    <tbody className="signal">
      <tr>
        <td>
          <span className={`state state-${signal.state}`}>{signal.state}</span>
        </td>
        <th scope="row" className="mono signal-cap">
          {signal.capability}
        </th>
        <td style={{ color: 'var(--text-dim)' }}>{signal.axis}</td>
        <td>
          {/* Provenance travels with every value. */}
          {hit?.patternId ? (
            <span className="tag">{hit.patternId}</span>
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>no source</span>
          )}
        </td>
      </tr>
      <tr>
        <td className="reason-cell" colSpan={4}>
          <span className="visually-hidden">Reasoning: </span>
          <span className="reason">{signal.reasoning}</span>
        </td>
      </tr>
    </tbody>
  );
}
