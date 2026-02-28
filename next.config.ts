import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure these packages are not bundled by Webpack (run as native Node modules)
  serverExternalPackages: [
    '@remotion/lambda',
    '@remotion/renderer',
    '@remotion/studio-server',
    '@remotion/bundler',
    'esbuild',
    'prettier',
    '@runware/sdk-js'
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.(mp3|wav|m4a)$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/media/[name].[hash][ext]',
      },
    });

    config.resolve.alias = {
      ...config.resolve.alias,
      '@remotion/compositor-win32-x64-msvc': false,
      '@remotion/compositor-darwin-x64': false,
      '@remotion/compositor-linux-x64-musl': false,
      '@remotion/compositor-linux-x64-gnu': false,
      '@remotion/compositor-linux-arm64-musl': false,
      '@remotion/compositor-linux-arm64-gnu': false,
    };

    return config;
  },
  // Ensure we can ignore TS errors during build if needed to proceed fast, 
  // but better to keep it clean. For now just webpack.
};

export default nextConfig;
