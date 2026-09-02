import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Safegate',
  description:
    'An open, reproducible way to read what a crypto token can actually do to you. Structural capability, with coverage and reasoning, never a verdict.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              <div className="tag">methodology 0.1.0</div>
            </div>
          </aside>

          <header className="topbar">
            <div className="topbar-note" style={{ fontSize: 'var(--fs-body)', color: 'var(--text-dim)' }}>
              Structural capability analysis. Not a safety rating.
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <span className="tag">ethereum</span>
              <span className="tag">solana</span>
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
