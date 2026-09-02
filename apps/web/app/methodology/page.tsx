import { CAPABILITY_AXIS, CAPABILITY_WEIGHT } from '@safegate/signals/normalise.js';
import { METHODOLOGY_VERSION } from '@safegate/scoring/model2.js';
import { PageHeader } from '@/components/PageHeader';
import type { Capability, Axis } from '@safegate/types.js';

export const dynamic = 'force-dynamic';

/**
 * The weights and mappings on this page are imported from the running scorer,
 * not retyped. A published methodology that can drift from the code it claims to
 * describe is worse than no published methodology, because it looks like a
 * commitment while quietly becoming a lie.
 */

const AXIS_QUESTION: Record<Axis, string> = {
  control: 'How much do you have to trust them not to act against you?',
  transparency: 'How much can you check for yourself?',
  exit: 'If this goes bad, can you get out?',
};

const STATES = [
  { state: 'PRESENT', colour: 'var(--present)', meaning: 'The capability exists and nothing on record justifies it.' },
  { state: 'EXPECTED', colour: 'var(--expected)', meaning: 'The capability exists AND a reviewed registry entry justifies it for this exact token.' },
  { state: 'ABSENT', colour: 'var(--absent)', meaning: 'At least one pattern ran and confirmed the capability is not there.' },
  { state: 'UNKNOWN', colour: 'var(--unknown)', meaning: 'We could not determine it. Never treated as absent.' },
];

export default function MethodologyPage() {
  const capabilities = Object.keys(CAPABILITY_WEIGHT) as Capability[];
  const sorted = [...capabilities].sort((a, b) => CAPABILITY_WEIGHT[b] - CAPABILITY_WEIGHT[a]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      <PageHeader
        title="Methodology"
        lead="Everything needed to recompute a Safegate score by hand, disagree with it precisely, and be right. The weights below are read from the running scorer, not retyped, so this page cannot drift from the code."
        stats={[
          { label: 'version', value: METHODOLOGY_VERSION },
          { label: 'capabilities', value: capabilities.length },
          { label: 'axes', value: 3 },
        ]}
      />

      <div className="grid-fluid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">What is being measured</h2>
          </div>
          <div className="panel-body">
            <p className="reason" style={{ marginTop: 0 }}>
              Not whether a token is a scam. That is a prediction, and the state of the art cannot make it. The
              most rigorous published rug pull detection is explicitly retrospective: it identifies state
              changes that have already happened.
            </p>
            <p className="reason" style={{ marginBottom: 0 }}>
              Safegate measures <strong style={{ color: 'var(--text)' }}>structural capability</strong>. What
              powers exist over this token right now, who holds them, whether anything justifies them, and how
              much of that we could verify.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Signal states</h2>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
            {STATES.map((s) => (
              <div key={s.state} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span className={`state state-${s.state}`} style={{ flexShrink: 0, minWidth: 88 }}>
                  {s.state}
                </span>
                <span className="reason">{s.meaning}</span>
              </div>
            ))}
            <div className="callout callout-warn" style={{ marginTop: 4 }}>
              <strong style={{ color: 'var(--unknown)' }}>UNKNOWN is never ABSENT.</strong> This is the most
              important rule here. Commercial scanners omit fields rather than nulling them, so any system
              reading a missing field as clean gives its best score to the tokens it understands least. UNKNOWN
              is excluded from the axis maths entirely and reduces coverage instead.
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Capability weights and axis mapping</h2>
          <span className="tag">live from src/signals/normalise.ts</span>
        </div>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 720 }}>
            <colgroup>
              <col style={{ width: 200 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 90 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Capability</th>
                <th>Axis</th>
                <th style={{ textAlign: 'right' }}>Weight</th>
                <th>Why this weight</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((cap) => (
                <tr key={cap}>
                  <td className="mono" style={{ color: 'var(--text)' }}>
                    {cap}
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-meta)' }}>{CAPABILITY_AXIS[cap]}</td>
                  <td data-numeric style={{ textAlign: 'right', color: 'var(--text)' }}>
                    {CAPABILITY_WEIGHT[cap]}
                  </td>
                  <td className="reason">{WEIGHT_REASON[cap]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-fluid">
        {(Object.keys(AXIS_QUESTION) as Axis[]).map((axis) => (
          <section key={axis} className="panel">
            <div className="panel-head">
              <h2 className="panel-title">{axis}</h2>
              <span className="tag">higher is worse</span>
            </div>
            <div className="panel-body">
              <p className="reason" style={{ margin: '0 0 10px', color: 'var(--text)' }}>
                {AXIS_QUESTION[axis]}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sorted
                  .filter((c) => CAPABILITY_AXIS[c] === axis)
                  .map((c) => (
                    <span key={c} className="tag">
                      {c} <span style={{ color: 'var(--text-dim)' }}>{CAPABILITY_WEIGHT[c]}</span>
                    </span>
                  ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="grid-fluid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">The formula</h2>
          </div>
          <div className="panel-body">
            <pre
              className="mono"
              style={{
                margin: 0,
                fontSize: 'var(--fs-body)',
                color: 'var(--text-dim)',
                background: 'var(--bg)',
                padding: 12,
                borderRadius: 4,
                overflowX: 'auto',
              }}
            >
{`axis = round(100 * sum(weight of PRESENT)
                 / sum(weight of RESOLVED))

RESOLVED = PRESENT + EXPECTED + ABSENT
UNKNOWN appears in neither term.

coverage = resolved signals / applicable signals`}
            </pre>
            <p className="reason" style={{ marginBottom: 0 }}>
              EXPECTED counts in the denominator but not the numerator. The capability is real and was checked,
              and the registry explains why it is there. That is how a regulated stablecoin scores 0 on control
              while its mint authority is plainly live and plainly displayed.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Reproducibility</h2>
          </div>
          <div className="panel-body">
            <p className="reason" style={{ marginTop: 0 }}>
              <span className="mono" style={{ color: 'var(--text)' }}>
                src/scoring/model2.ts
              </span>{' '}
              is a pure function. No network, no filesystem, no clock, no randomness. Timestamps and input
              hashes are passed in.
            </p>
            <p className="reason" style={{ marginBottom: 0 }}>
              Every score carries its methodology version and an input snapshot hash. Given the same inputs and
              version, the output is byte-identical, and that is asserted in the test suite. If the scorer could
              reach the network, calling it reproducible would be marketing.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Sources and disagreement</h2>
          </div>
          <div className="panel-body">
            <p className="reason" style={{ marginTop: 0 }}>
              On-chain reading is primary. Third-party APIs corroborate. Because we read the chain ourselves,
              our source overlaps with both of them, which makes genuine cross-checking possible.
            </p>
            <p className="reason" style={{ marginBottom: 0 }}>
              Where readings conflict, both values are shown and the capability is reported unresolved. Where a
              figure is unavailable to us entirely, our reading is UNKNOWN and any third-party number sits
              beside it under attribution, outside the score.
            </p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">The incident axis</h2>
        </div>
        <div className="panel-body">
          <div className="callout callout-warn">
            Reported as the literal <span className="mono">insufficient-data</span>, not as a number. Detecting
            what has already gone wrong needs transaction history the current sources do not provide. A bare 0
            would read as &quot;no incidents, therefore safe&quot;, which is false for every fresh token, and
            most tokens that rug have a clean history right up until they do not.
          </div>
        </div>
      </section>
    </div>
  );
}

const WEIGHT_REASON: Record<Capability, string> = {
  'mint-authority':
    'Acts directly on every holder. Unlimited new supply dilutes everyone at once.',
  'freeze-authority':
    'Acts directly on one holder. Targets an individual and stops them leaving, which is why it sits level with mint.',
  'admin-authority':
    'Indirect. An admin can usually grant themselves the direct capabilities, which is why it is close behind them.',
  upgradeability:
    'Indirect but total. Renouncing ownership is close to security theatre while a proxy can swap in mint or transfer-restriction logic that did not exist at audit time.',
  'transfer-restriction':
    'Assigned to exit rather than control, even though pausing is plainly insider power, because being unable to sell is how a holder actually loses money.',
  'fee-control':
    'Erodes value on the way out rather than blocking it. Real, but recoverable in a way a freeze is not.',
  'metadata-mutability':
    'Weighted 1 deliberately. It fires on RAY, JUP and BONK, three well established tokens, so scoring it meaningfully would manufacture false positives across a blue-chip set. Reported for completeness and near enough ignored.',
};
