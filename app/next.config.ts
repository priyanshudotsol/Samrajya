import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The repo root has its own (Anchor/yarn) lockfile; keep Next scoped to app/.
  outputFileTracingRoot: path.join(__dirname),
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
