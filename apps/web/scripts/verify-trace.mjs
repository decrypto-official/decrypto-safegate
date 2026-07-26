#!/usr/bin/env node
/**
 * Asserts the built output actually carries patterns/ and registry/.
 *
 * The engine reads those directories from disk at request time on paths built
 * from import.meta.url, which Next's file tracing cannot see statically. If
 * `outputFileTracingIncludes` is wrong or missing, the build still succeeds and
 * every route still returns 200, but the data is absent and every lookup fails.
 *
 * `next build` and `next start` both run against the local filesystem, so
 * neither catches this. Reading the trace manifests is the only local check that
 * reflects what a serverless deployment will actually receive.
 *
 * Run after `next build`.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const ROOT = join(WEB, '..', '..');

/** Routes whose handlers reach the engine, so must carry the data. */
const MUST_INCLUDE_DATA = ['api/score/route', 'registry/page', 'patterns/page', 'disclosure/page'];

async function countSourceFiles() {
  let patterns = 0;
  for (const family of ['evm', 'solana']) {
    const files = await readdir(join(ROOT, 'patterns', family));
    patterns += files.filter((f) => f.endsWith('.json')).length;
  }

  let registry = 0;
  for (const chain of ['ethereum', 'solana']) {
    const files = await readdir(join(ROOT, 'registry', 'issuers', chain));
    registry += files.filter((f) => f.endsWith('.json')).length;
  }

  return { patterns, registry };
}

async function findManifests(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await findManifests(full, found);
    else if (entry.name.endsWith('.nft.json')) found.push(full);
  }
  return found;
}

function normalise(filePath) {
  const unix = filePath.replace(/\\/g, '/');
  const match = /(patterns\/(?:evm|solana)\/[^/]+\.json|registry\/issuers\/(?:ethereum|solana)\/[^/]+\.json)$/.exec(
    unix
  );
  return match ? match[1] : null;
}

const expected = await countSourceFiles();

let manifests;
try {
  manifests = await findManifests(join(WEB, '.next', 'server', 'app'));
} catch {
  console.error('verify-trace: no build output found. Run `next build` first.');
  process.exit(1);
}

const failures = [];

for (const route of MUST_INCLUDE_DATA) {
  const manifest = manifests.find((m) => m.endsWith(join('app', ...route.split('/')) + '.js.nft.json'));
  if (!manifest) {
    failures.push(`${route}: no trace manifest found`);
    continue;
  }

  const { files = [] } = JSON.parse(await readFile(manifest, 'utf8'));
  const traced = new Set(files.map(normalise).filter(Boolean));

  const patterns = [...traced].filter((f) => f.startsWith('patterns/')).length;
  const registry = [...traced].filter((f) => f.startsWith('registry/')).length;

  if (patterns !== expected.patterns) {
    failures.push(`${route}: traced ${patterns} pattern files, expected ${expected.patterns}`);
  }
  if (registry !== expected.registry) {
    failures.push(`${route}: traced ${registry} registry files, expected ${expected.registry}`);
  }
}

if (failures.length > 0) {
  console.error('\nverify-trace FAILED. The deployment would serve no data.\n');
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    '\nCheck outputFileTracingIncludes in next.config.mjs. Globs resolve from apps/web,\n' +
      'so reaching the repo root needs a ../../ prefix.\n'
  );
  process.exit(1);
}

console.log(
  `verify-trace ok: ${expected.patterns} patterns and ${expected.registry} registry entries ` +
    `traced into ${MUST_INCLUDE_DATA.length} routes`
);
