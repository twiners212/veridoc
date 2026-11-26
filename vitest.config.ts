import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "server-only": path.resolve(
        import.meta.dirname,
        "./tests/helpers/server-only-mock.ts"
      ),
    },
  },
});
