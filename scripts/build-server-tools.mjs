/**
 * Bundles the background worker and the backup CLI into dist/*.cjs for the production image
 * (no tsx / TypeScript / dev dependencies at runtime).
 *  • `react-server` export condition, so modules guarded by `server-only` load outside Next.js.
 *  • Pure-JS dependencies are bundled in; only packages that must stay real modules are external
 *    (Prisma engine, native Argon2, PDF/DOCX parsers) — all present in the standalone output.
 *  • next/headers and next/navigation are replaced by scripts/stubs/next-request.ts.
 */
import { build } from "esbuild";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs", // CommonJS: resolves next/headers etc. without ESM extension rules
  external: ["@prisma/client", ".prisma/client", "@node-rs/argon2", "pdf-parse", "pdf-parse/*", "mammoth"],
  conditions: ["react-server"],
  alias: {
    "@": path.join(root, "src"),
    // No HTTP request exists in the worker / CLI: request APIs behave as outside a request scope.
    "next/headers": path.join(root, "scripts/stubs/next-request.ts"),
    "next/navigation": path.join(root, "scripts/stubs/next-request.ts"),
  },
  tsconfig: path.join(root, "tsconfig.json"),
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
};

await build({ ...common, entryPoints: [path.join(root, "src/worker/index.ts")], outfile: path.join(root, "dist/worker.cjs") });
await build({ ...common, entryPoints: [path.join(root, "scripts/backup.ts")], outfile: path.join(root, "dist/backup.cjs") });
await build({ ...common, entryPoints: [path.join(root, "scripts/create-owner.ts")], outfile: path.join(root, "dist/create-owner.cjs") });
