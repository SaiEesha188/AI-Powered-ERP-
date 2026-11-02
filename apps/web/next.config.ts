import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

const config: NextConfig = {
  // The browser talks to /api on this origin; Next forwards to the API, so no CORS is needed.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
  transpilePackages: ['@erp/shared'],
};

export default config;
