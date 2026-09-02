import { STANDING_LIMITATIONS } from '@safegate/scoring/model2.js';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

/**
 * The standing limitations are imported from the scorer, so the list attached to
 * every score and the list on this page are literally the same array. They cannot
 * disagree with each other.
 */

const SECTIONS = [
  {
    title: 'Structural, not predictive',
    body: [
      'Safegate reads what a token’s code can do. It does not and cannot predict what anyone will do with it.',
      'The research agrees. The most rigorous published Solana rug pull detection is explicitly retrospective: it identifies state changes that have already happened, and its authors note it misses slow-moving scams and anything outside its observation window.',
      'Nothing here predicts a rug. Anyone claiming otherwise, including anyone forking this project, is overselling it.',
    ],
  },
  {
    title: 'Off-chain risk is invisible',
    body: [
      'The chain records what happened, never why or who intended it.',
      'Team intent is the most important variable and is entirely unobservable. Custody cannot be verified by reading a contract: WBTC’s value depends on BitGo actually holding bitcoin, and no amount of contract reading confirms a vault. Private agreements, undisclosed allocations, off-chain unlock schedules and key management are all outside what any structural tool can see.',
      'These are the vectors most rug pulls actually use.',
    ],
  },
  {
    title: 'Coverage is not safety',
    body: [
      'A coverage figure of 100 percent means we resolved every check we know how to make. It does not mean the token is safe, and it does not mean nothing else is checkable.',
      'Coverage measures our completeness, not the token’s virtue. A simple token with nothing to find scores high coverage trivially.',
    ],
  },
  {
    title: 'The registry is human judgement',
    body: [
      'Entries are written and approved by people. That is a deliberate trade: an automatic classifier would be reproducible but trivially gamed, since anything presenting as a stablecoin would inherit a pardon for the most dangerous capability pair a token can hold.',
      'So an entry can be wrong, entries go stale, and absence of an entry means nothing at all. Most legitimate tokens are not in the registry.',
      'EXPECTED is not SAFE. It means the capability is structurally normal and justified. The holder can still use it. Circle can freeze your USDC, and that is precisely what the entry says.',
    ],
  },
  {
    title: 'Patterns are always incomplete',
    body: [
      'The dictionary covers the contract shapes we know. New shapes appear constantly.',
      'When no pattern matches, the result is UNKNOWN and coverage drops, so the gap is at least visible. But a token using an admin pattern we have never seen will under-report its capabilities, and we will not know it happened.',
      'This is the failure mode we consider most likely, and it is why the dictionary is open to contribution.',
    ],
  },
  {
    title: 'Concentration is ambiguous even when measured',
    body: [
      'Solana holder concentration is not verified by us. The public RPC permanently rate limits the call required, so any figure shown comes from a third party, is labelled as such, and is excluded from the score.',
      'More broadly, a genuine treasury, vesting contract or locker is indistinguishable on-chain from a whale about to dump unless the address happens to be labelled, and it often is not. Two of the highest-concentration tokens we tested were established blue chips.',
    ],
  },
  {
    title: 'What the score cannot rank',
    body: [
      'Safegate compares structure, not quality, value or prospects. It has nothing to say about whether a token is a good investment, whether its price is reasonable, whether its team is competent, or whether its product works.',
      'A token can score zero on every axis and be worthless.',
    ],
  },
  {
    title: 'Point in time',
    body: [
      'Every score is a snapshot. An upgradeable contract can change in the next block. A registry entry reflects the day it was reviewed. Always check the computed-at timestamp.',
    ],
  },
];

export default function LimitationsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      <PageHeader
        title="Limitations"
        lead="What Safegate cannot tell you. This is why the tool reports capabilities with reasoning instead of verdicts."
      />

      <div className="callout callout-warn" style={{ fontSize: 'var(--fs-body)' }}>
        <strong style={{ color: 'var(--unknown)' }}>If you read nothing else:</strong> a good Safegate score is
        not permission to buy anything.
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Attached to every score</h2>
          <span className="tag">live from src/scoring/model2.ts</span>
        </div>
        <div className="panel-body">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            {STANDING_LIMITATIONS.map((l, i) => (
              <li key={i} className="reason">
                {l}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid-fluid">
        {SECTIONS.map((section) => (
          <section key={section.title} className="panel">
            <div className="panel-head">
              <h2 className="panel-title">{section.title}</h2>
            </div>
            <div className="panel-body">
              {section.body.map((p, i) => (
                <p
                  key={i}
                  className="reason"
                  style={{ marginTop: i === 0 ? 0 : 10, marginBottom: i === section.body.length - 1 ? 0 : 0 }}
                >
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Not financial advice</h2>
        </div>
        <div className="panel-body">
          <p className="reason" style={{ margin: 0 }}>
            Safegate is an informational tool. Its publisher has commercial interests in crypto, declared on
            the <a href="/disclosure">disclosure page</a>. Nothing here is financial, investment or legal
            advice, and nothing here is a recommendation to buy, sell or hold anything.
          </p>
        </div>
      </section>
    </div>
  );
}
