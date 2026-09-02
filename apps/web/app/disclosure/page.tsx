import { loadRegistry } from '@safegate/registry/lookup.js';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

/**
 * Generated from the registry, never hand-maintained.
 *
 * `commercialRelationship` is a required field on every entry, so concealing a
 * relationship means actively deleting a field rather than forgetting to add
 * one. That shows up in review and in git history.
 */

export default async function DisclosurePage() {
  const entries = await loadRegistry();
  const disclosed = entries.filter((e) => e.commercialRelationship !== null);
  const clean = disclosed.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      <PageHeader
        title="Disclosure"
        lead="Any commercial relationship between the maintainer and an entity rated by Safegate. Generated from the registry rather than written by hand, so it cannot quietly fall out of date."
        stats={[
          { label: 'entries checked', value: entries.length },
          { label: 'commercial ties', value: disclosed.length, note: 'declared, not audited' },
        ]}
      />

      <div className={clean ? 'callout' : 'callout callout-warn'} style={{ fontSize: 'var(--fs-body)' }}>
        {clean ? (
          <>
            <strong style={{ color: 'var(--absent)' }}>No commercial relationships exist</strong> with any
            issuer in the registry. All {entries.length} entries declare{' '}
            <span className="mono">commercialRelationship: null</span>, verified programmatically rather than
            asserted.
          </>
        ) : (
          <>
            <strong style={{ color: 'var(--unknown)' }}>{disclosed.length} disclosed relationship(s).</strong>{' '}
            Each is listed below and shown on that token&apos;s page.
          </>
        )}
      </div>

      {!clean && (
        <section className="panel" style={{ borderColor: 'var(--unknown)' }}>
          <div className="panel-head">
            <h2 className="panel-title" style={{ color: 'var(--unknown)' }}>
              Declared relationships
            </h2>
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <colgroup>
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 180 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Chain</th>
                  <th>Issuer</th>
                  <th>Relationship</th>
                </tr>
              </thead>
              <tbody>
                {disclosed.map((e) => (
                  <tr key={e.id}>
                    <td className="mono" style={{ color: 'var(--text)' }}>
                      {e.symbol}
                    </td>
                    <td style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-faint)' }}>{e.chain}</td>
                    <td style={{ fontSize: 'var(--fs-body)', color: 'var(--text-dim)' }}>{e.issuer.name}</td>
                    <td className="reason">{e.commercialRelationship}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid-fluid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">The conflict</h2>
          </div>
          <div className="panel-body">
            <p className="reason" style={{ marginTop: 0 }}>
              Safegate is published by Decrypto, which has commercial interests in crypto, including user
              subscriptions, exchange referrals, and potentially paid services built on Safegate itself.
            </p>
            <p className="reason" style={{ marginBottom: 0 }}>
              Anyone publishing ratings while holding commercial interests in the rated industry has a
              conflict. Ours is structural and we are not claiming to have removed it. What matters is whether
              the controls on it can be checked from outside, without asking anyone&apos;s permission.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">The rule</h2>
          </div>
          <div className="panel-body">
            <p className="reason" style={{ marginTop: 0, color: 'var(--text)' }}>
              No payment is accepted from token issuers for anything that touches a rating.
            </p>
            <p className="reason" style={{ margin: '8px 0 0' }}>
              No paid placement, no paid rating, no expedited registry review. Where a commercial relationship
              with an issuer exists for any other reason, it is declared in that token&apos;s registry entry and
              appears here and on the token&apos;s page automatically.
            </p>
            <p className="reason" style={{ marginBottom: 0 }}>
              If this rule is ever relaxed, it has to be changed in public, before any money moves.
            </p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">How this stays honest</h2>
        </div>
        <div className="panel-body">
          <div className="grid-fluid">
            <div className="callout">
              <strong style={{ color: 'var(--text)' }}>Everything is in git.</strong>
              <div className="reason" style={{ marginTop: 4 }}>
                Every registry entry, every pattern, every weight, and every change to them carries an author
                and a date. Anyone who suspects a score was bought can read the diff.
              </div>
            </div>
            <div className="callout">
              <strong style={{ color: 'var(--text)' }}>Reproducibility over promises.</strong>
              <div className="reason" style={{ marginTop: 4 }}>
                The method and weights are published and the scorer is a pure function. A number a stranger can
                recompute cannot be bent by payment. This is the primary control and everything else is
                secondary to it.
              </div>
            </div>
            <div className="callout">
              <strong style={{ color: 'var(--text)' }}>No override exists.</strong>
              <div className="reason" style={{ marginTop: 4 }}>
                There is no manual score, no allow-list that bypasses the algorithm, and no adjustment
                mechanism outside the published methodology. Adding one would be a visible code change.
              </div>
            </div>
            <div className="callout">
              <strong style={{ color: 'var(--text)' }}>Disclosure is a required field.</strong>
              <div className="reason" style={{ marginTop: 4 }}>
                Every registry entry must declare a relationship or explicitly declare none. This page is
                generated from those fields, so concealing one means deleting a field, which shows in review
                and in git history.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Reporting a suspected undisclosed relationship</h2>
        </div>
        <div className="panel-body">
          <p className="reason" style={{ margin: 0 }}>
            Open a public GitHub issue. Do not email. A conflict-of-interest allegation handled in private is
            worthless as a control, because the outcome cannot be distinguished from a settlement.
          </p>
        </div>
      </section>
    </div>
  );
}
