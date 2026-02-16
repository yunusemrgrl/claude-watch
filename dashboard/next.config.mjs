/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  // Static export only for production build
  ...(isDev ? {} : { output: 'export', distDir: '../dist/public' }),
  trailingSlash: true,
  // Dev mode: proxy API requests to Fastify server on port 4317
  async rewrites() {
    return [
      {
        source: '/snapshot',
        destination: 'http://localhost:4317/snapshot',
      },
      {
        source: '/health',
        destination: 'http://localhost:4317/health',
      },
    ];
  },
};

export default nextConfig;
