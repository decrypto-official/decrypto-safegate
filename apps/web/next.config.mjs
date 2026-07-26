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
