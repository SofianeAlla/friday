// Bundle the TS/Express backend into a single ESM file for the packaged app.
// Node built-ins stay external; deps (express/cors/fast-glob) are bundled. The
// require shim lets any bundled CJS dep call require() under ESM output.

import { build } from "esbuild";

await build({
  entryPoints: ["server/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "build/server.mjs",
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});

console.log("✓ built build/server.mjs");
