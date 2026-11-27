import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { test, expect } from "@playwright/test";
import * as schema from "../src/db/schema";
import { DEMO_TENANT } from "../src/lib/auth/demo-accounts";
import { assertSafeE2eDatabaseUrl } from "./helpers/e2e-db-guard";

config({ path: ".env.local" });
config();

/**
 * Behavioral E2E Verification for Authoring & Edit Persistence (AUD-001, AUD-002)
 *
 * Verifies:
 * 1. CreateDocumentModal persists a new SOP to PostgreSQL (no fake UUID 404 fallback).
 * 2. DocumentDetailView Save Draft persists title/content changes to PostgreSQL across page reloads.
 */
test.describe("Workflow Mutations & DB Persistence (AUD-001, AUD-002)", () => {
  const uniqueCode = `SOP-E2E-MUT-${Date.now().toString(36).toUpperCase()}`;

  test.afterAll(async () => {
    const connectionString =
      process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) return;

    assertSafeE2eDatabaseUrl(connectionString);
    const client = postgres(connectionString, { prepare: false, max: 1 });
    const db = drizzle(client, { schema });
    try {
      const docs = await db
        .select({ id: schema.documents.id })
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.tenantId, DEMO_TENANT.id),
            eq(schema.documents.documentCode, uniqueCode)
          )
        );
      if (docs.length > 0) {
        const docIds = docs.map((d) => d.id);
        await client.begin(async (tx) => {
          await tx`SET LOCAL session_replication_role = 'replica'`;
          await tx`DELETE FROM veridoc.document_versions WHERE document_id = ANY(${docIds})`;
          await tx`DELETE FROM veridoc.documents WHERE id = ANY(${docIds})`;
        });
      }
    } catch {
      // Best-effort cleanup
    } finally {
      await client.end();
    }
  });

  test("creating a new SOP and saving draft edits persists to PostgreSQL across reload", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto("/auth/sign-in");
    await page.getByTestId("demo-login-DOCUMENT_AUTHOR").click();
    await page.waitForURL(/\/documents/, { timeout: 15000 });

    // Open New SOP modal
    await page.locator("button", { hasText: "New SOP" }).click();
    await expect(
      page.locator("h2#create-doc-title")
    ).toBeVisible({ timeout: 5000 });

    await page
      .locator("input[placeholder='e.g. SOP-SAF-004']")
      .fill(uniqueCode);
    await page
      .locator("input[placeholder='e.g. Chemical Handling & Spill Response Procedure']")
      .fill("Mutation Persistence Test SOP");

    await page
      .locator("button[type='submit']", { hasText: "Create Controlled SOP" })
      .click();

    // Expect the newly created SOP to persist in PostgreSQL (AUD-001 fails before fix: shows fake SOP-NEW-001 or vanishes on reload)
    const createdLink = page.locator("a", { hasText: uniqueCode }).first();
    await expect(createdLink).toBeVisible({ timeout: 10000 });
    await page.reload();
    await expect(
      page.locator("a", { hasText: uniqueCode }).first()
    ).toBeVisible({ timeout: 10000 });
    await page.locator("a", { hasText: uniqueCode }).first().click();
    await page.waitForURL(/\/documents\/[0-9a-f-]+/i, { timeout: 15000 });

    const titleInput = page.locator(
      "input[placeholder='Enter SOP Document Title...']"
    );
    await expect(titleInput).toHaveValue("Mutation Persistence Test SOP", {
      timeout: 10000,
    });

    // Update title and save draft (AUD-002 fails here across reload before fix)
    await titleInput.fill("Mutation Persistence Test SOP Updated");
    await page.locator("button", { hasText: "Save Draft" }).click();
    await expect(
      page.locator("text=Document version saved successfully.")
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(
      page.locator("input[placeholder='Enter SOP Document Title...']")
    ).toHaveValue("Mutation Persistence Test SOP Updated", {
      timeout: 10000,
    });
  });
});
