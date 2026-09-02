/**
 * The two figures the design spec asks for, drawn by hand.
 *
 * The spec names a library for both. That library does not exist: there is no
 * such npm package, no repository, and the only registry hit for the name is an
 * unrelated package that lists it beside real libraries as though it were one.
 * Nothing to install and nothing to fall back to.
 *
 * Neither shape needs one. A ring is a single circle with a dash offset, and a
 * three-point radar is three points at fixed angles joined into a polygon. A
 * charting library earns its weight through generality — arbitrary series,
 * legends, tooltips, animation — and none of that applies when the shape is
 * fixed and there is one of it. Inline SVG costs no dependency, inherits the
 * CSS custom properties directly, and renders on the server.
 */

import type { Axis, Score } from '@safegate/types.js';

const AXES: Axis[] = ['control', 'transparency', 'exit'];

/** Short enough to sit beside the figure, long enough to be a word. */
const LABEL: Record<Axis, string> = {
  control: 'control',
  transparency: 'transp.',
  exit: 'exit',
};

export function severity(value: number): string {
  if (value >= 60) return 'var(--present)';
  if (value >= 30) return 'var(--unknown)';
  return 'var(--absent)';
}

/**
 * Coverage as a ratio of a whole.
 *
 * The figure is never shown without its denominator: the spec's first rule is
 * that a bare number must be impossible to see, and a naked percentage is the
 * most screenshottable object a page like this can contain. The ring is also
 * deliberately not coloured by value — banding it green above 80 would make it
 * a verdict, and coverage is a statement about how much we could read, not
 * about whether the token is safe.
 */
export function CoverageRing({ scored, applicable }: { scored: number; applicable: number }) {
  const ratio = applicable > 0 ? scored / applicable : 0;
  const pct = Math.round(ratio * 100);
  const r = 34;
  const circumference = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${scored} of ${applicable} applicable checks resolved`}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-raised)" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="var(--text-dim)"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform="rotate(-90 42 42)"
          style={{ transition: 'stroke-dashoffset 180ms cubic-bezier(0.2, 0, 0, 1)' }}
        />
        <text
          x="42"
          y="42"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text)"
          fontSize="18"
          fontWeight="600"
          fontFamily="var(--font-mono)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {pct}%
        </text>
      </svg>
      <div>
        <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text)' }}>
          {scored} of {applicable} applicable checks resolved
        </div>
        <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)', margin: '4px 0 0', maxWidth: '38ch' }}>
          Coverage measures how much of this token we could check. It is not a safety measure.
        </p>
      </div>
    </div>
  );
}

/**
 * The three axes as a triangle.
 *
 * The spec asks for a three-point radar with labelled bars beneath it, because
 * a three-point radar alone cannot be read precisely — you can see a shape, not
 * a value. That is the right call and both halves are kept: the polygon carries
 * the shape at a glance, the bars carry the numbers.
 *
 * An unassessed axis is drawn at the centre and marked, never at zero. Plotting
 * "we could not check this" at the origin would draw the smallest, calmest
 * triangle for the token we know least about.
 */
export function AxesRadar({ score }: { score: Score }) {
  const size = 190;
  const c = size / 2;
  const maxR = 56;
  // Straight up, then clockwise. -90deg puts control at the apex.
  const angles = [-90, 30, 150].map((d) => (d * Math.PI) / 180);

  const points = AXES.map((axis, i) => {
    const a = score.axes[axis];
    const r = a.assessed ? (a.value / 100) * maxR : 0;
    return {
      axis,
      assessed: a.assessed,
      value: a.value,
      x: c + r * Math.cos(angles[i]),
      y: c + r * Math.sin(angles[i]),
      lx: c + (maxR + 22) * Math.cos(angles[i]),
      ly: c + (maxR + 22) * Math.sin(angles[i]),
    };
  });

  // Only assessed axes are plotted. An unassessed axis has no value to place,
  // and plotting it at the origin put it on the exact pixel where a genuine
  // zero sits — Exit scoring 0 and Transparency resolving nothing landed on top
  // of one another, which is the confusion the hatched meter track exists to
  // prevent, reintroduced in the figure. Its spoke is drawn dashed instead.
  const assessedPoints = points.filter((p) => p.assessed);
  const polygon = assessedPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={AXES.map((axis) => {
        const a = score.axes[axis];
        return `${axis}: ${a.assessed ? a.value : 'not assessed'}`;
      }).join('. ')}
    >
      {/* Rings at 25/50/75/100, so the polygon can be read against a scale. */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={angles
            .map((ang) => `${(c + maxR * f * Math.cos(ang)).toFixed(1)},${(c + maxR * f * Math.sin(ang)).toFixed(1)}`)
            .join(' ')}
          fill="none"
          stroke="var(--grid)"
          strokeWidth="1"
        />
      ))}
      {points.map((p, i) => (
        <line
          key={p.axis}
          x1={c}
          y1={c}
          x2={c + maxR * Math.cos(angles[i])}
          y2={c + maxR * Math.sin(angles[i])}
          stroke={p.assessed ? 'var(--grid)' : 'var(--text-faint)'}
          strokeWidth="1"
          strokeDasharray={p.assessed ? undefined : '2 3'}
        />
      ))}

      {/* Two points make a line, not a shape, so the polygon is only drawn when
          there are three. Below that the markers carry it. */}
      {assessedPoints.length === 3 && (
        <polygon points={polygon} fill="var(--accent)" fillOpacity="0.14" stroke="var(--accent)" strokeWidth="1.5" />
      )}

      {points.map((p) => (
        <g key={p.axis}>
          {p.assessed && <circle cx={p.x} cy={p.y} r="3.5" fill={severity(p.value)} />}
          <text
            x={p.lx}
            y={p.ly}
            textAnchor="middle"
            dominantBaseline="central"
            fill={p.assessed ? 'var(--text-dim)' : 'var(--text-faint)'}
            fontSize="11"
            fontFamily="var(--font-mono)"
          >
            {LABEL[p.axis]}
          </text>
          {!p.assessed && (
            <text
              x={p.lx}
              y={p.ly + 12}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--text-faint)"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              n/a
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
