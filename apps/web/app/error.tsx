'use client';

/**
 * The error boundary for every page under app/.
 *
 * Three pages read the engine's data directly at render time: /patterns,
 * /registry and /disclosure all call loadPatterns() or loadRegistry() in the
 * server component body. Since 0.1.1 those loaders throw rather than returning
 * an empty array, which is correct, but without a boundary Next renders its
 * generic 500 and production hides the message behind "a server-side exception
 * has occurred". 0.1.1 gave /api/score an honest 503 naming the fault and left
 * these three pages opaque.
 *
 * The rule this page exists to uphold is the same one the scorer applies to
 * token capabilities: an absence must never be presentable as a clean result.
 * A blank registry page and a registry page that could not load look identical
 * to a reader, and only one of them means "there is nothing here".
 *
 * Note on the message: React strips error messages from client boundaries in
 * production builds, replacing them with an opaque `digest`. So this component
 * cannot echo the loader's carefully written explanation to the reader, and
 * does not try. It states what is certainly true in either case, and surfaces
 * the digest so the real message can be found in the server log.
 */

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel">
      <div className="panel-body">
        <h1 style={{ fontSize: 22, margin: '0 0 10px', letterSpacing: '-0.02em', color: 'var(--unknown)' }}>
          This page could not be loaded
        </h1>

        <p className="reason" style={{ margin: '0 0 14px' }}>
          Something failed on the server while preparing this page. Nothing below is missing
          because it does not exist; it is missing because we could not read it. Do not read
          this page as an empty result.
        </p>

        <p className="reason" style={{ margin: '0 0 14px' }}>
          If you were looking at a token, its score was not computed. If you were looking at the
          registry or the pattern dictionary, this is not evidence that either is empty.
        </p>

        {error.digest && (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 14 }}>
            server reference <span data-numeric>{error.digest}</span>
            {' — the full error is in the server log under this id'}
          </div>
        )}

        <button
          onClick={reset}
          style={{
            font: 'inherit',
            fontSize: 12,
            color: 'var(--text)',
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            padding: '7px 14px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
