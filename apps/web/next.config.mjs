import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '../../src');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The scoring engine lives in ../../src and is imported directly rather than
  // published as a package, so the repo stays a single source of truth.
  outputFileTracingRoot: path.resolve(HERE, '../../'),
  experimental: { externalDir: true },

  // The engine reads patterns/ and registry/ from disk at request time, on paths
  // built from import.meta.url. Tracing cannot see those statically, so without
  // this the JSON is missing from the serverless bundle and every lookup fails.
  //
  // Globs resolve from this directory (apps/web), not from outputFileTracingRoot,
  // hence the ../../ prefix to reach the repo root. Verify after changing it:
  // the route .nft.json files under .next/server/app must list the JSON.
  outputFileTracingIncludes: {
    '/**': ['../../patterns/**/*.json', '../../registry/**/*.json'],
  },

  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, '@safegate': ENGINE };

    // The engine is strict ESM, so its internal imports carry `.js` extensions
    // that point at `.ts` files on disk. TypeScript resolves that in bundler
    // mode; webpack needs telling explicitly.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };

    return config;
  },
};

export default nextConfig;
