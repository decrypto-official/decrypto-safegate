export function PageHeader({
  title,
  lead,
  stats,
}: {
  title: string;
  lead: string;
  stats?: Array<{ label: string; value: string | number; note?: string }>;
}) {
  return (
    <div className="panel">
      <div className="panel-body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h1 style={{ fontSize: 'var(--fs-xl)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>{title}</h1>
          <p className="reason" style={{ margin: 0 }}>
            {lead}
          </p>
        </div>

        {stats && stats.length > 0 && (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {stats.map((s) => (
              <div key={s.label}>
                {/* Counts are never tinted with a state colour.
                    `tone: 'good'` painted these in --absent green and `'warn'`
                    in --unknown amber, which are the colours for "verified not
                    present" and "could not check". A tally of registry entries
                    is neither, and the registry page was rendering 0 commercial
                    ties in the same green used for a capability we confirmed is
                    absent — reading as "clean" when it can only honestly mean
                    "none declared". That is this product's own absence-is-not-
                    safety error, committed in its own interface. */}
                <div data-numeric style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-bold)', color: 'var(--text)' }}>
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 'var(--fs-label)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-faint)',
                  }}
                >
                  {s.label}
                </div>
                {s.note && (
                  <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)', marginTop: 2 }}>
                    {s.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
