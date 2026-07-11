import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "./src"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    environment: "node",
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["**/node_modules/**", "tests/integration/**"],
        },
      },
      {
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
