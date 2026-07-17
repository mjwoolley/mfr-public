import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "./src"),
};

export default defineConfig({
  // React plugin so JSX in transitively-imported @mfr/ui components (the
  // barrel re-exports .tsx files; lib/authz.ts pulls it in via
  // portalSignInUrl) transforms under the node test environment — same
  // rationale as apps/web/vitest.config.ts.
  plugins: [react()],
  resolve: { alias },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      // Explicit include = honest coverage: vitest only counts files imported
      // by tests unless include globs are set, in which case every matching
      // file is reported (untested files show up at 0%).
      include: ["src/**/*.{ts,tsx}"],
      // Segment-anchored (**/dir/**) rather than bare relative globs: vitest
      // matches coverage excludes against ABSOLUTE paths with picomatch
      // `contains: true`, so a bare `tests/**` silently excludes EVERY file
      // when the checkout path itself contains the substring `tests/` (e.g.
      // a worktree named accounting-tests) — coverage reports 0/0.
      exclude: [
        "**/src/generated/**",
        "**/tests/**",
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/*.config.*",
        "**/.next/**",
      ],
      // Thresholds are a ratchet floor on the logic subset only (glob keys,
      // matched relative to this directory). Pages/layouts/client components
      // are measured and reported but not thresholded — e2e covers them.
      // No top-level lines/branches/... keys here: global thresholds would
      // apply to ALL included files, pages included.
      // Raise these as tests are added (target: 90). CI enforces them in the
      // integration job, where the merged unit+integration run happens.
      ...(process.env.COVERAGE_UNIT_ONLY
        ? {} // unit-only local run: merged thresholds would spuriously fail
        : {
            // Baseline measured 2026-07-16 (merged unit+integration run).
            thresholds: {
              "src/lib/**/*.ts": { lines: 86, branches: 74, functions: 89, statements: 86 },
              "src/actions/**/*.ts": { lines: 85, branches: 59, functions: 89, statements: 85 },
              "src/emails/**/*.tsx": { lines: 50, branches: 50, functions: 50, statements: 50 },
              // The two route handlers are untested today — raise from zero
              // as tests land.
              "src/app/**/route.ts": { lines: 0, branches: 0, functions: 0, statements: 0 },
            },
          }),
    },
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["**/node_modules/**", "tests/integration/**"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/setup.ts"],
          // src/lib/prisma.ts's `prisma` and src/lib/identityDb.ts's
          // `identityDb` are module-load-time singletons that read
          // process.env.DATABASE_URL / IDENTITY_DATABASE_URL exactly once, at
          // import time. A plain top-of-test-file
          // `process.env.DATABASE_URL = process.env.TEST_DATABASE_URL`
          // statement does NOT reliably run before those imports: ES module
          // semantics evaluate a module's dependencies before the importing
          // module's own top-level statements, even ones that appear earlier
          // in the source text.
          //
          // Vitest's `test.env` is applied to process.env by the runner
          // before a worker evaluates the test file's module graph at all,
          // so it is not subject to that ordering problem. This is what
          // actually redirects the `prisma`/`identityDb` singletons to the
          // test branches.
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL,
            IDENTITY_DATABASE_URL: process.env.TEST_IDENTITY_DATABASE_URL,
          },
        },
      },
    ],
  },
});
