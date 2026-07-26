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

export function Nav() {
  const pathname = usePathname();

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
