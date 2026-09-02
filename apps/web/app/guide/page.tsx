import { loadPatterns } from '@safegate/patterns/resolve.js';
import { PageHeader } from '@/components/PageHeader';

/**
 * The guide.
 *
 * Written for someone who has never read a smart contract and does not intend
 * to start. It is a page in the dashboard rather than a document beside it,
 * because the thing it explains is two clicks away and the vocabulary it
 * defines is the vocabulary on screen. It carries print styles, so the browser
 * makes a clean PDF of it without a second version existing to drift.
 *
 * Anything countable is read from the code rather than typed here, and the
 * regression suite holds the prose to the vocabulary the scorer actually emits.
 * A guide that quietly falls behind the product is worse than no guide: it is
 * wrong with the authority of documentation.
 */

export const metadata = {
  title: 'Guide — Safegate',
  description: 'How to read a Safegate report, and what every word on it means.',
};

function Term({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <div className="term">
      <dt>{word}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function GuidePage() {
  // Counted, never typed. This number changes every time someone contributes a
  // pattern, which is exactly the kind of fact that rots in prose.
  const patternCount = (await loadPatterns()).length;

  return (
    <div className="guide" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pad)' }}>
      <PageHeader
        title="How to read this"
        lead="Safegate looks at a token's code on the blockchain and tells you what powers exist over it — who can create more, freeze yours, or change the rules. It never tells you a token is safe. This page explains everything on the screen, in plain words."
      />

      <section className="panel">
        <div className="panel-body guide-body">
          <h2>Start here</h2>
          <ol className="steps">
            <li>
              <strong>Open Lookup</strong> and pick the chain — Ethereum or Solana.
            </li>
            <li>
              <strong>Paste the token&apos;s address.</strong> That long string starting <code>0x</code> is the
              token&apos;s permanent home on the blockchain. Copy it from the project&apos;s own site or from a
              block explorer. If you are not sure it is the real one, stop: a fake token with a real
              token&apos;s name is the oldest trick there is, and this tool reads the address you give it.
            </li>
            <li>
              <strong>Press Analyse.</strong> The report arrives in a few seconds.
            </li>
          </ol>
          <p>
            There are example tokens under the box if you want to see a finished report before you have an
            address of your own.
          </p>

          <h2>The two ideas the whole thing rests on</h2>
          <div className="callout callout-warn">
            <strong>Absence is never safety.</strong> If we could not check something, we say so and the
            coverage figure drops. A thing we failed to read is never quietly counted as clean. Most tools
            round &ldquo;we did not find it&rdquo; up to &ldquo;it is not there&rdquo;. Those are different
            statements and only one of them is honest.
          </div>
          <div className="callout callout-info">
            <strong>An expected power is still a power.</strong> Some powers have a good reason to exist. A
            regulated stablecoin issuer is legally required to be able to freeze coins on a court order. We
            record that reason and show it — but we never pretend the power is absent. Someone can still use
            it.
          </div>

          <h2>Reading a report, top to bottom</h2>

          <h3>1. The name and the registry tag</h3>
          <p>
            The token&apos;s symbol, its name, and the address we actually read. If we hold a{' '}
            <strong>registry entry</strong> for it, a tag says which kind of token we have recorded it as and
            who approved that, with the date. No tag simply means we have no entry — that is neutral
            information, not a warning. Most honest tokens have no entry.
          </p>

          <h3>2. The three axes</h3>
          <p>
            Every token is scored on three questions, from 0 to 100. <strong>Higher is worse.</strong> They
            never get added together into one number, because a single number is the thing people screenshot
            and misquote.
          </p>
          <dl className="kv-list">
            <Term word="Control">How much do you have to trust them not to act against you?</Term>
            <Term word="Transparency">How much can you check for yourself?</Term>
            <Term word="Exit">If this goes bad, can you get out?</Term>
          </dl>
          <p className="note">
            <strong>Watch the difference between 0 and n/a.</strong> A <strong>0</strong> means we checked and
            found nothing — good news. <strong>n/a</strong> means we could not check that axis at all, and its
            bar is drawn with diagonal stripes so you can tell at a glance. They look similar and they mean
            opposite things. A striped bar is not a clean bill of health.
          </p>

          <h3>3. Coverage</h3>
          <p>
            The ring says how much of the token we managed to check — for example <strong>3 of 4</strong>{' '}
            checks resolved. It is not a safety score. A token can be 100% checked and deeply risky, or 50%
            checked and fine. It tells you how much weight the rest of the page can carry.
          </p>

          <h3>4. Not read by any pattern</h3>
          <p>
            This panel only appears when the contract can do something we do not know how to read. We can see
            that the function is there, but not who is allowed to use it. That is reported as{' '}
            <em>unaccounted for</em>, never as absent, and it is deliberately placed above the findings so
            nobody stops reading before they reach it.
          </p>

          <h3>5. Signals</h3>
          <p>
            One row per capability, with the reason we reached that conclusion written underneath in full. The
            <strong> Source</strong> column names the pattern that read it, so you can look up our method and
            check the work yourself.
          </p>
          <div className="table-wrap">
            <table className="table states">
              <thead>
                <tr>
                  <th scope="col">State</th>
                  <th scope="col">What it means</th>
                  <th scope="col">How to read it</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row"><span className="state state-PRESENT">PRESENT</span></th>
                  <td>The power exists and nothing we know of justifies it.</td>
                  <td>Someone holds it. Ask who, and what stops them using it.</td>
                </tr>
                <tr>
                  <th scope="row"><span className="state state-EXPECTED">EXPECTED</span></th>
                  <td>The power exists and our registry records a documented reason.</td>
                  <td>Still a real power. The reason is shown — decide if you accept it.</td>
                </tr>
                <tr>
                  <th scope="row"><span className="state state-ABSENT">ABSENT</span></th>
                  <td>We looked for it and it is genuinely not there.</td>
                  <td>The one state that is actually reassuring.</td>
                </tr>
                <tr>
                  <th scope="row"><span className="state state-UNKNOWN">UNKNOWN</span></th>
                  <td>We could not check. Nothing more.</td>
                  <td>Treat as an open question, never as a clean result.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>6. What this cannot tell you</h3>
          <p>
            The limits of this particular report, on the page rather than buried in a footer. Read them before
            you rely on anything above.
          </p>

          <h2>Three real examples</h2>

          <h3>USDC — expected powers are still powers</h3>
          <p>
            USDC on Ethereum can be upgraded, paused, and has an administrator. All three come back{' '}
            <span className="state state-EXPECTED">EXPECTED</span>, because a regulated issuer must be able to
            comply with the law. A scanner that flagged those as dangers would be wrong; one that hid them
            would also be wrong. Both facts are true at once, and the report says so.
          </p>

          <h3>MKR — the admin that hides</h3>
          <p>
            Ask MKR who its owner is and you get nothing back. A naive tool concludes &ldquo;no admin, safe&rdquo;.
            It is wrong: MKR is administered through a second, older mechanism, and we report the
            administrator we find there. The same report also shows an open gap — MKR can create new supply
            and we still cannot read who is allowed to. We say that plainly rather than call it absent.
          </p>

          <h3>WBTC — when a flag lies</h3>
          <p>
            WBTC has a function whose name promises it can permanently stop new coins being created. Read the
            code and that function does nothing at all: it was overridden to return &ldquo;no&rdquo; and change
            nothing. Minting on WBTC can never be switched off. Anyone trusting the flag would conclude the
            exact opposite of the truth — which is why we score on whether the mechanism exists, not on what
            it currently says.
          </p>

          <h2>Word list</h2>
          <dl className="kv-list">
            <Term word="Token">A coin or asset that lives on a blockchain.</Term>
            <Term word="Smart contract">
              The program that runs the token. It is public, so anyone can read it — which is why this tool
              can work without asking anyone&apos;s permission.
            </Term>
            <Term word="Address">
              A token&apos;s permanent identifier, usually starting <code>0x</code>. Two tokens can share a
              name; they cannot share an address.
            </Term>
            <Term word="Mint">
              Create new units out of nothing. If supply doubles, your share halves. This is dilution, not
              theft, and it is usually legal.
            </Term>
            <Term word="Burn">Destroy units. Harmless on your own coins, serious if someone can do it to yours.</Term>
            <Term word="Freeze">Stop one particular person&apos;s tokens from moving.</Term>
            <Term word="Pause">Stop everybody&apos;s transfers at once.</Term>
            <Term word="Blacklist">Block one address from transacting.</Term>
            <Term word="Admin / owner">The address allowed to do the privileged things above.</Term>
            <Term word="Upgradeable (proxy)">
              The code can be replaced later. The contract you read today may not be the one running
              tomorrow, which is why we treat it as a capability rather than a detail.
            </Term>
            <Term word="Timelock">
              A forced delay before an admin action takes effect. It does not remove the power; it gives
              people time to notice and leave.
            </Term>
            <Term word="Renounced">
              The owner has been set to nobody, so the power is gone for good. Often claimed. Sometimes the
              power simply lives somewhere else in the contract — see MKR above.
            </Term>
            <Term word="Pattern">
              Our written instruction for where to look in a contract for one particular power. There are{' '}
              {patternCount} of them today. They are public, and the Patterns page lists every one.
            </Term>
            <Term word="Registry">
              Our list of tokens where a power has a documented reason. Every entry needs evidence from two
              independent kinds of source, a named approver, and a review date.
            </Term>
            <Term word="Coverage">How much of the token we managed to check. Not a safety measure.</Term>
            <Term word="Selector">
              The short identifier of a function in compiled code. It is how we spot that a function exists
              even when we cannot read who may call it.
            </Term>
            <Term word="Storage slot">
              A numbered box inside the contract where a value is kept. Knowing which box to open is most of
              the skill.
            </Term>
            <Term word="DAO">A group that governs something by voting rather than by one owner.</Term>
            <Term word="Stablecoin">A token meant to hold a steady value, usually one US dollar.</Term>
          </dl>

          <h2>What this cannot do</h2>
          <p>
            This is a reading of structure, not a prediction. It cannot see intent, private agreements, who
            really controls a key, or hidden schedules. It cannot tell you whether a token will lose value or
            whether its team is honest. It reads what the code permits, and stops there.
          </p>
          <p className="note">
            Everything here can be recomputed by anyone from public inputs. If you disagree with a result, the
            method, the patterns and the registry are all published — check it and say so.
          </p>

          <p className="print-hint">
            To keep a copy: print this page from your browser and choose &ldquo;Save as PDF&rdquo;.
          </p>
        </div>
      </section>
    </div>
  );
}
