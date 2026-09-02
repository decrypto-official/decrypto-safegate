'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { section: 'Analyse', items: [{ href: '/', label: 'Lookup' }] },
  {
    section: 'The data',
    items: [
      { href: '/registry', label: 'Registry' },
      { href: '/patterns', label: 'Patterns' },
    ],
  },
  {
    section: 'How it works',
    items: [
      { href: '/methodology', label: 'Methodology' },
      { href: '/limitations', label: 'Limitations' },
      { href: '/disclosure', label: 'Disclosure' },
    ],
  },
];

/**
 * `variant="bar"` is the same links as one horizontal strip, for viewports
 * where the sidebar is hidden. Below 1024px the sidebar was set to
 * `display: none` with nothing in its place, so every destination except the
 * brand link — Registry, Patterns, Methodology, Limitations, Disclosure — was
 * unreachable on a phone or a tablet in portrait except by typing the URL.
 *
 * The bar drops the section headings rather than laying them out sideways:
 * six links fit on one line, and the grouping is a convenience at sidebar
 * width rather than information the reader needs to navigate.
 */
export function Nav({ variant = 'sidebar' }: { variant?: 'sidebar' | 'bar' }) {
  const pathname = usePathname();

  if (variant === 'bar') {
    const items = NAV.flatMap((group) => group.items);
    return (
      <nav className="nav-bar" aria-label="Main">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="nav-item"
            aria-current={pathname === item.href ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="nav" aria-label="Main">
      {NAV.map((group) => (
        <div key={group.section}>
          <div className="nav-label">{group.section}</div>
          {group.items.map((item) => (
            <Link
              key={item.href}
              className="nav-item"
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
