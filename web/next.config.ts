import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { webpack, isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });

    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          "sodium-native": false,
          "require-addon": false,
        },
      };

      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(sodium-native|require-addon)$/,
        })
      );
    }

    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /sodium-native/ },
      { module: /require-addon/ },
      { message: /Critical dependency: the request of a dependency is an expression/ },
      { message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/ },
    ];

    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
