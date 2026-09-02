import { loadPatterns } from '@safegate/patterns/resolve.js';
import { PatternBrowser } from '@/components/PatternBrowser';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function PatternsPage() {
  const patterns = await loadPatterns();
  const warned = patterns.filter((p) => p.knownFalseNegative).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      <PageHeader
        title="Pattern dictionary"
        lead="Where to look for one capability on one contract shape: which storage slot, which selector, which account field. Patterns are pure data and make no judgement. They scale with contract shapes rather than with tokens, so one file can make thousands of tokens readable."
        stats={[
          { label: 'patterns', value: patterns.length },
          { label: 'evm', value: patterns.filter((p) => p.chainFamily === 'evm').length },
          { label: 'solana', value: patterns.filter((p) => p.chainFamily === 'solana').length },
          { label: 'document a false negative', value: warned },
        ]}
      />
      <PatternBrowser patterns={patterns} />
    </div>
  );
}
