if (process.env.NEXT_BUILD_TARGET === 'static') {
  module.exports = require('./next.config.static.js');
} else {

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  transpilePackages: ['@sapience/ui'],
  // @zerodev/ecdsa-validator requires permissionless@0.1.x but 0.2.x is installed;
  // externalize for server bundles so Node resolves them at runtime.
  serverExternalPackages: ['@zerodev/ecdsa-validator', '@zerodev/sdk'],
  eslint: {
    dirs: ['src'],
    ignoreDuringBuilds: true,
  },
  // Because we import the 403.html file in middleware.ts, we need to tell webpack to treat it as an asset.
  webpack: (config, { isServer }) => {
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

// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

const isProduction = process.env.VERCEL_ENV === 'production' || process.env.CI;

const sentryConfig = {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    org: "foil",
    project: "app-tz",

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Disabled — adds a Babel pass over every component. Re-enable if using Sentry session replay.
    reactComponentAnnotation: {
      enabled: false,
    },

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Only upload source maps in CI
    sourcemaps: {
      disable: !process.env.CI,
    },

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
};

// Only wrap with Sentry plugin in production/CI — skip source map upload + instrumentation in preview/dev builds
module.exports = isProduction
  ? withSentryConfig(nextConfig, sentryConfig)
  : nextConfig;

} // end NEXT_BUILD_TARGET !== 'static'
