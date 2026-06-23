import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't bundle Noir/BB.js on the server — they're browser-only WASM packages.
  serverExternalPackages: [
    "@noir-lang/noir_js",
    "@noir-lang/acvm_js",
    "@noir-lang/noirc_abi",
    "@noir-lang/types",
    "@aztec/bb.js",
  ],

  webpack: (config, { webpack, isServer }) => {
    // Enable async WASM loading
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Emit WASM files as static assets instead of trying to inline them
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });

    if (isServer) {
      // Server: mark Noir/BB.js as external so they're never bundled server-side
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [
        ...externals,
        "@noir-lang/noir_js",
        "@noir-lang/acvm_js",
        "@aztec/bb.js",
      ];
    } else {
      // Browser: stub out Node-only modules so the browser bundle doesn't crash
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve?.fallback,
          worker_threads: false,
          "stream/promises": false,
          fs: false,
          path: false,
          crypto: false,
          stream: false,
          os: false,
          net: false,
          tls: false,
          child_process: false,
        },
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
      { message: /Can't resolve 'worker_threads'/ },
      { message: /Can't resolve 'stream\/promises'/ },
    ];

    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
