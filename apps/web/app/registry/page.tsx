import { loadRegistry } from '@safegate/registry/lookup.js';
import { RegistryBrowser } from '@/components/RegistryBrowser';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function RegistryPage() {
  const entries = await loadRegistry();
  const disclosed = entries.filter((e) => e.commercialRelationship !== null).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      <PageHeader
        title="Registry"
        lead="Which capabilities are expected for which token, and the evidence for saying so. An entry converts a capability from unjustified to justified, which lowers a score, so every entry carries at least two independent evidence items, a named approver and an expiry date. An entry never means a token is safe."
        stats={[
          { label: 'entries', value: entries.length },
          { label: 'ethereum', value: entries.filter((e) => e.chain === 'ethereum').length },
          { label: 'solana', value: entries.filter((e) => e.chain === 'solana').length },
          { label: 'commercial ties', value: disclosed, note: 'declared, not audited' },
        ]}
      />
      <RegistryBrowser entries={entries} />
    </div>
  );
}
