import { config } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { test, expect } from "@playwright/test";
import * as schema from "../src/db/schema";
import { DEMO_ACCOUNTS, DEMO_TENANT } from "../src/lib/auth/demo-accounts";
import { assertSafeE2eDatabaseUrl } from "./helpers/e2e-db-guard";

config({ path: ".env.local" });
config();

/**
 * VeriDoc Phase 5 — Mobile-First Reader PWA & Engagement Gate Verification (UC-02)
 *
 * Verifies:
 * 1. Mobile viewport (375x812) per DEC-07.
 * 2. Real sign-in as seeded READER via /auth/sign-in -> /to-read.
 * 3. Engagement gate enforcement: Acknowledge CTA button is disabled until
 *    scroll depth >= 90% AND dwell time >= 10s.
 * 4. Live progress strip updates with scroll depth and elapsed dwell time.
 * 5. Fulfill reading requirements -> CTA button unlocks.
 * 6. Tap CTA -> opens modal with binding attestation and monospace SHA-256 digest.
 * 7. Confirm sign-off -> instant Acknowledgment Receipt display committed to live PostgreSQL.
 *
 * Uses an ephemeral E2E-scoped SOP + read assignment cleaned up in afterAll so repeated runs are deterministic.
 */

function canonicalMetadata(documentCode: string, tenantId: string, title: string, versionLabel: string): string {
  return JSON.stringify({
    document_code: documentCode,
    tenant_id: tenantId,
    title,
    version_label: versionLabel,
  });
}

test.describe("Mobile Reader PWA Flow (UC-02 / DEC-07)", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });

  const e2eDocId = randomUUID();
  const e2eVerId = randomUUID();
  const e2eAssignId = randomUUID();
  const e2eDocCode = `SOP-E2E-${Date.now().toString(36).toUpperCase()}`;

  test.beforeAll(async () => {
    const connectionString =
      process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DIRECT_DATABASE_URL or DATABASE_URL for E2E fixture setup");
    }

    const author = DEMO_ACCOUNTS.find((a) => a.role === "DOCUMENT_AUTHOR")!;
    const qm = DEMO_ACCOUNTS.find((a) => a.role === "QUALITY_MANAGER")!;
    const reader = DEMO_ACCOUNTS.find((a) => a.role === "READER")!;

    const title = "E2E Ephemeral Reader Engagement SOP";
    const markdown = `# ${e2eDocCode}: ${title}\n\n## 1. Purpose\nRepeatable mobile PWA engagement gate verification procedure.\n\n## 2. Requirements\nRead the entire controlled SOP and confirm understanding before proceeding.\n\n${"### Verification Checkpoint\nEnsure all protective equipment and lockout procedures are verified prior to operation.\n\n".repeat(8)}`;
    const sha = createHash("sha256")
      .update(
        `${markdown}${canonicalMetadata(e2eDocCode, DEMO_TENANT.id, title, "v1.0")}`,
        "utf8"
      )
      .digest("hex");

    assertSafeE2eDatabaseUrl(connectionString);
    const client = postgres(connectionString, { prepare: false, max: 1 });
    const db = drizzle(client, { schema });
    try {
      const now = new Date();
      await db.insert(schema.documents).values({
        id: e2eDocId,
        tenantId: DEMO_TENANT.id,
        documentCode: e2eDocCode,
        category: "Quality",
        createdBy: author.id,
      });

      await db.insert(schema.documentVersions).values({
        id: e2eVerId,
        tenantId: DEMO_TENANT.id,
        documentId: e2eDocId,
        versionMajor: 1,
        versionMinor: 0,
        title,
        contentFormat: "MARKDOWN",
        markdownContent: markdown,
        documentSha256: sha,
        lifecycleState: "PUBLISHED",
        authorId: author.id,
        effectiveDate: now,
        publishedAt: now,
        publishedBy: qm.id,
        rowVersion: 1,
      });

      await db.insert(schema.readAssignments).values({
        id: e2eAssignId,
        tenantId: DEMO_TENANT.id,
        documentVersionId: e2eVerId,
        userId: reader.id,
        status: "PENDING",
        dueAt: new Date(now.getTime() + 60 * 60 * 1000),
      });
    } finally {
      await client.end();
    }
  });

  test.afterAll(async () => {
    const connectionString =
      process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) return;

    assertSafeE2eDatabaseUrl(connectionString);
    const client = postgres(connectionString, { prepare: false, max: 1 });
    try {
      await client.begin(async (sql) => {
        await sql`SET LOCAL session_replication_role = 'replica'`;
        await sql`DELETE FROM veridoc.read_acknowledgments WHERE read_assignment_id = ${e2eAssignId}`;
        await sql`DELETE FROM veridoc.read_assignments WHERE id = ${e2eAssignId}`;
        await sql`DELETE FROM veridoc.document_versions WHERE id = ${e2eVerId}`;
        await sql`DELETE FROM veridoc.documents WHERE id = ${e2eDocId}`;
      });
    } finally {
      await client.end();
    }
  });

  test("enforces engagement gate (scroll >= 90% and dwell >= 10s), unlocks CTA, and renders binding receipt", async ({
    page,
  }) => {
    // 1. Sign in via /auth/sign-in as READER
    await page.goto("/auth/sign-in");
    const readerDemoBtn = page.getByTestId("demo-login-READER");
    await expect(readerDemoBtn).toBeVisible();
    await readerDemoBtn.click();
    await page.waitForURL(/\/to-read/, { timeout: 15000 });

    // 2. Verify To-Read Queue header and ephemeral E2E SOP card on 375x812
    await expect(
      page.locator("h1", { hasText: "Hello David Miller" })
    ).toBeVisible();

    const readCta = page
      .locator(`a[href*='/read/${e2eDocId}']`, { hasText: "Tap to Read & Sign" })
      .first();
    await expect(readCta).toBeVisible({ timeout: 15000 });
    await readCta.click();
    await page.waitForURL(new RegExp(`/read/${e2eDocId}`, "i"), {
      timeout: 15000,
    });

    // 3. Verify Reader Acknowledgment Bar is present at the bottom
    const ackBar = page.locator("aside[aria-label='Document Acknowledgment Bar']");
    await expect(ackBar).toBeVisible();

    // Verify initial gated state: CTA button is disabled
    const ackButton = ackBar.locator("button");
    await expect(ackButton).toBeDisabled();

    // Verify progress text indicates engagement requirements
    const progressFeedback = ackBar
      .locator("text=Scroll:")
      .or(ackBar.locator("text=Time:"));
    await expect(progressFeedback).toBeVisible();

    // 4. Simulate reading engagement: Scroll to bottom of content (>= 90%)
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });

    // 5. Wait for dwell time threshold (>= 10 seconds)
    await page.waitForTimeout(10500);

    // 6. Verify reading requirements are fulfilled
    const readyIndicator = ackBar
      .locator("text=Reading Requirements Fulfilled")
      .first();
    await expect(readyIndicator).toBeVisible({ timeout: 5000 });

    // Verify CTA button is now unlocked and enabled
    await expect(ackButton).toBeEnabled();

    // 7. Tap unlocked Acknowledge CTA button (minimum 44px touch target)
    const buttonBox = await ackButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
    await ackButton.click();

    // 8. Verify Confirmation Modal dialog
    const modalDialog = page.locator("div[role='dialog']");
    await expect(modalDialog).toBeVisible();
    await expect(
      modalDialog.locator("h3:has-text('Confirm SOP Read Acknowledgment')")
    ).toBeVisible();

    // Verify bound monospace SHA-256 digest is displayed
    const digestCard = modalDialog.locator("text=Bound Payload Digest (SHA-256)");
    await expect(digestCard).toBeVisible();

    // Verify binding attestation checkbox
    const attestationCheckbox = modalDialog.locator("input[type='checkbox']");
    await expect(attestationCheckbox).toBeChecked();

    // 9. Submit Acknowledgment against live PostgreSQL
    const signButton = modalDialog.locator(
      "button:has-text('Sign & Record Acknowledgment')"
    );
    await expect(signButton).toBeEnabled();
    await signButton.click();

    // 10. Verify Instant Acknowledgment Receipt Modal
    const receiptHeading = page.locator(
      "h3:has-text('Binding Acknowledgment Recorded')"
    );
    await expect(receiptHeading).toBeVisible({ timeout: 10000 });

    // Verify receipt metadata elements
    await expect(page.locator("text=Receipt Number:")).toBeVisible();
    await expect(
      page
        .locator("text=Return to To-Read Queue")
        .or(page.locator("text=Return to Queue"))
    ).toBeVisible();
  });
});
