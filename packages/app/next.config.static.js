/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  transpilePackages: ['@sapience/ui'],
  eslint: {
    dirs: ['src'],
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.html$/,
      type: 'asset/source',
    });
    config.externals = [...(config.externals || []), 'pino-pretty'];
    return config;
  },
};

module.exports = nextConfig;
