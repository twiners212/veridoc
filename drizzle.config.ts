import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/*",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["veridoc"],
  migrations: {
    schema: "veridoc",
    table: "__drizzle_migrations",
  },
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "",
  },
  verbose: true,
  strict: true,
});
