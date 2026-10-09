import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A second dev server (e.g. the mock on another port) needs its own build cache, or the two
  // overwrite each other's inlined NEXT_PUBLIC_* values: NEXT_DIST_DIR=.next-mock
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The repo root has its own (Anchor/yarn) lockfile; keep Next scoped to app/.
  outputFileTracingRoot: path.join(__dirname),
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
