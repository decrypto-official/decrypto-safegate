import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { METHODOLOGY_VERSION } from '@safegate/scoring/model2.js';
import { loadPatterns } from '@safegate/patterns/resolve.js';
import { loadRegistry } from '@safegate/registry/lookup.js';

export const metadata: Metadata = {
  title: 'Safegate',
  description:
    'An open, reproducible way to read what a crypto token can actually do to you. Structural capability, with coverage and reasoning, never a verdict.',
};

/**
 * Live counts for the topbar readouts, from the same loaders the scorer uses.
 *
 * The loaders throw when the data is missing, and nothing sits above the root
 * layout to catch that, so a failure here would take every page down at once.
 * It reads NA instead. The three data pages still fail loudly through their
 * own boundary, which is where that failure belongs.
 */
async function readouts(): Promise<{ patterns: string; registry: string }> {
  try {
    const [patterns, registry] = await Promise.all([loadPatterns(), loadRegistry()]);
    return { patterns: String(patterns.length), registry: String(registry.length) };
  } catch {
    return { patterns: 'NA', registry: 'NA' };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const counts = await readouts();

  return (
    <html lang="en">
      <body>
        {/* Grid shell filling the viewport. No max-width on any container. */}
        <div className="shell">
          <aside className="sidebar">
            <a className="brand" href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              safe<span>gate</span>
            </a>
            <Nav />
            <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--border)' }}>
              <div className="tag">methodology {METHODOLOGY_VERSION}</div>
            </div>
          </aside>

          <header className="topbar">
            <div className="topbar-note" style={{ fontSize: 'var(--fs-body)', color: 'var(--text-dim)' }}>
              Structural capability analysis. Not a safety rating.
            </div>
            {/* Instrument readouts: what the dictionary and the registry hold
                right now, from the files on disk, not a hardcoded figure. */}
            <div className="readouts" aria-label="Data on disk">
              <span>
                patterns <b data-numeric>{counts.patterns}</b>
              </span>
              <span>
                registry <b data-numeric>{counts.registry}</b>
              </span>
              <span>ethereum · solana</span>
            </div>
          </header>

          {/* Only rendered visibly below 1024px, where .sidebar is hidden. */}
          <div className="mobile-nav">
            <Nav variant="bar" />
          </div>

          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
