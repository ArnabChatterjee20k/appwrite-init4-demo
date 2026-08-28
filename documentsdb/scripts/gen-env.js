// Generates src/env.generated.js from the .env values Bun loads into
// process.env, so the browser bundle has the Appwrite connection config.
// (Bun does not inline process.env into the client bundle on its own.)
// Only the four public client values are emitted — never the API key.

const keys = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_DATABASE_ID",
  "APPWRITE_TABLE_ID",
];

const cfg = {};
for (const k of keys) cfg[k] = process.env[k] ?? "";

const out =
  "// AUTO-GENERATED from .env by scripts/gen-env.js — do not edit.\n" +
  "export const ENV = " +
  JSON.stringify(cfg, null, 2) +
  ";\n";

await Bun.write(new URL("../src/env.generated.js", import.meta.url), out);

const missing = keys.filter((k) => !cfg[k]);
if (missing.length) console.warn("[gen-env] missing .env values:", missing.join(", "));
else console.log("[gen-env] wrote src/env.generated.js");
