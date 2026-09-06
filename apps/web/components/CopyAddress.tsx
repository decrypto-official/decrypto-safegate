'use client';

import { useEffect, useState } from 'react';

function truncate(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

/**
 * An address, truncated the one way DESIGN.md §5 allows, with the full value
 * copied on click. Says "copied" for a moment, then goes quiet.
 */
export function CopyAddress({ chain, address }: { chain: string; address: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard access can be refused. The full value is still in the title.
    }
  }

  return (
    <button
      type="button"
      className="addr addr-copy"
      onClick={copy}
      title={`${address} (click to copy)`}
      aria-label={`Copy address ${address}`}
      data-copied={copied}
    >
      {chain} {truncate(address)}
    </button>
  );
}
