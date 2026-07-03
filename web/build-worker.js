const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['workers/prover.worker.ts', 'workers/kyc.worker.ts'],
  bundle: true,
  outdir: 'public',
  format: 'esm',
  target: 'esnext',
  platform: 'browser',
  minify: false,
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.url': 'location.href',
  },
  plugins: [
    {
      name: 'node-polyfills',
      setup(build) {
        build.onResolve({ filter: /^(fs|path|crypto|stream|os|net|tls|child_process|worker_threads|stream\/promises)$/ }, args => ({
          path: args.path,
          namespace: 'node-polyfill'
        }));
        build.onLoad({ filter: /.*/, namespace: 'node-polyfill' }, args => ({
          contents: 'export default {};',
        }));
      }
    }
  ]
}).then(() => {
  console.log('Worker built successfully as ESM to public/prover.worker.js');
}).catch(() => process.exit(1));
