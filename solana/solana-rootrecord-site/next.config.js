/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/start', destination: '/dashboard', permanent: true },
      { source: '/docs', destination: '/operations/docs', permanent: true },
      { source: '/ecosystem', destination: '/operations/ecosystem', permanent: true },
      { source: '/liquidity-timing', destination: '/operations/liquidity-timing', permanent: true },
      { source: '/tokenomics', destination: '/operations/tokenomics', permanent: true },
    ];
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'pino-pretty', 'lokijs', 'encoding'];
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.ipfs.nftstorage.link' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: '**.mypinata.cloud' },
      { protocol: 'https', hostname: 'ipfs.io' },
    ],
  },
};

module.exports = nextConfig;
