// esbuild bundler for the Arcanum frontend (see cli.tsx entry point).
//
// The bundle is ESM (ink/yoga use top-level await) but most dependencies ship
// as CommonJS and call require() for node builtins at runtime. esbuild's
// "Dynamic require of X is not supported" shim kicks in unless the bundle
// defines `require` - so we inject a createRequire banner.
//
// Run with: node esbuild.mjs  (npm run build)
import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/cli.js',
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
