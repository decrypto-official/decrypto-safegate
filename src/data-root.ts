/**
 * Locates the patterns/ and registry/ directories at runtime.
 *
 * These cannot be found from `import.meta.url`. A bundler inlines that as a
 * literal build-time path, so in a serverless deployment it points at the build
 * machine's checkout directory, which does not exist when the function runs. The
 * data files are present, just not where the baked path says.
 *
 * So the search is anchored on the working directory first, which is the
 * deployment root where traced files land, and falls back to module-relative
 * paths for local and unbundled use. Every candidate is reported on failure,
 * because the useful thing in a log is knowing where it actually looked.
 */

import { access, constants } from 'node:fs/promises';
import { dirname, join, resolve, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DataDirName = 'patterns' | 'registry';

/** A subpath that must exist inside the directory, proving it is the real one. */
const MARKER: Record<DataDirName, string> = {
  patterns: join('evm'),
  registry: join('issuers', 'ethereum'),
};

export class DataRootError extends Error {
  constructor(
    message: string,
    readonly candidates: string[]
  ) {
    super(message);
    this.name = 'DataRootError';
  }
}

async function isDir(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** A path and each of its ancestors, nearest first, stopping at the filesystem root. */
function selfAndAncestors(from: string, limit = 6): string[] {
  const out: string[] = [];
  let current = resolve(from);
  const root = parse(current).root;

  for (let i = 0; i <= limit; i += 1) {
    out.push(current);
    if (current === root) break;
    current = dirname(current);
  }

  return out;
}

function moduleDir(): string | null {
  // Wrapped because a bundler may rewrite import.meta.url into something that is
  // not a file URL at all, and that must not take down the whole search.
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return null;
  }
}

function candidateRoots(): string[] {
  const roots: string[] = [];

  // Explicit override wins. Useful for unusual deployments and for debugging a
  // live one without a code change.
  const override = process.env.SAFEGATE_DATA_ROOT;
  if (override) roots.push(resolve(override));

  // The working directory is the deployment root in a serverless function, which
  // is where output tracing places included files.
  roots.push(...selfAndAncestors(process.cwd()));

  // Module-relative, for local runs, the CLI, and tests.
  const here = moduleDir();
  if (here) roots.push(...selfAndAncestors(here));

  return [...new Set(roots)];
}

const cache = new Map<DataDirName, string>();

export async function findDataDir(name: DataDirName): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  const tried: string[] = [];

  for (const root of candidateRoots()) {
    const dir = join(root, name);
    tried.push(dir);
    if (await isDir(join(dir, MARKER[name]))) {
      cache.set(name, dir);
      return dir;
    }
  }

  throw new DataRootError(
    `could not locate the ${name} directory. Looked for ${join(name, MARKER[name])} under ` +
      `${tried.length} candidate roots. cwd is ${process.cwd()}. ` +
      `In a bundled deployment this means ${name}/**/*.json was not included in the build ` +
      `output, or was placed somewhere unexpected. Set SAFEGATE_DATA_ROOT to override. ` +
      `Tried: ${tried.join(', ')}`,
    tried
  );
}

/** Test seam. */
export function clearDataDirCache(): void {
  cache.clear();
}
