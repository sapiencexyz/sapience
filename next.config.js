if (process.env.NEXT_BUILD_TARGET === 'static') {
  module.exports = require('./next.config.static.js');
} else {

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  env: {
    // App-wide default network: Robinhood Mainnet (chainId 4663 ==
    // CHAIN_ID_ROBINHOOD_MAINNET). The SDK's DEFAULT_CHAIN_ID reads this via
    // NEXT_PUBLIC_DEFAULT_CHAIN_ID, so setting it here scopes the default to the
    // app's Next build only. A per-deployment env var still wins when set.
    NEXT_PUBLIC_DEFAULT_CHAIN_ID:
      process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || '4663',
  },
  eslint: {
    dirs: ['src'],
    ignoreDuringBuilds: true,
  },
  // Because we import the 403.html file in middleware.ts, we need to tell webpack to treat it as an asset.
  webpack: (config) => {
    config.module.rules.push({
      test: /\.html$/,
      type: 'asset/source',
    });
    // pino-pretty is an optional dep that pino tries to require at runtime;
    // mark it as external so webpack doesn't fail the build.
    config.externals = [...(config.externals || []), 'pino-pretty'];
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/discord',
        destination: 'http://discord.gg/sapience',
        permanent: false,
      },
    ];
  }
};

module.exports = nextConfig;

} // end NEXT_BUILD_TARGET !== 'static'
