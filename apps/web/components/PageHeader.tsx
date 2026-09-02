export function PageHeader({
  title,
  lead,
  stats,
}: {
  title: string;
  lead: string;
  stats?: Array<{ label: string; value: string | number; tone?: 'plain' | 'good' | 'warn' }>;
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
                <div
                  data-numeric
                  style={{
                    fontSize: 'var(--fs-xl)',
                    fontWeight: 600,
                    color:
                      s.tone === 'good' ? 'var(--absent)' : s.tone === 'warn' ? 'var(--unknown)' : 'var(--text)',
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 'var(--fs-label)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
