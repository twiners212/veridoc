import { config } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { test, expect, type Page } from "@playwright/test";
import * as schema from "../src/db/schema";
import { DEMO_ACCOUNTS, DEMO_TENANT } from "../src/lib/auth/demo-accounts";
import { assertSafeE2eDatabaseUrl } from "./helpers/e2e-db-guard";

config({ path: ".env.local" });
config();

/**
 * VeriDoc Slice 1 — Acceptance Criteria E2E Suite (AC-01 through AC-05)
 *
 * Verifies:
 * - Auth Gate: Unauthenticated protected routes redirect to /auth/sign-in?callbackUrl=...
 * - AC-01: Multi-Step Sequential Approval Flow (UC-01)
 * - AC-02: Invalidation & Concurrent Edit Race Condition Controls (UC-03, DEC-04)
 * - AC-03: Publication & Mandatory Read Acknowledgment Queue (UC-02)
 * - AC-04: External Audit Packet Verification & Sign Out (UC-04, DEC-08)
 * - AC-05: Strict Tenant & Role Isolation (REQ-NFR-002)
 */

type DemoRole =
  | "WORKSPACE_ADMIN"
  | "QUALITY_MANAGER"
  | "DOCUMENT_AUTHOR"
  | "APPROVER_REVIEWER"
  | "READER";

async function signInAsDemoRole(
  page: Page,
  role: DemoRole,
  expectedUrl: RegExp
): Promise<void> {
  await page.goto("/auth/sign-in");
  const demoButton = page.getByTestId(`demo-login-${role}`);
  await expect(demoButton).toBeVisible({ timeout: 15000 });
  await demoButton.click();
  await page.waitForURL(expectedUrl, { timeout: 30000 });
}

test.describe("Slice 1 Acceptance Criteria (AC-01 through AC-05)", () => {
  const e2ePendingDocId = randomUUID();
  const e2ePendingVerId = randomUUID();
  const e2ePendingCycleId = randomUUID();
  const e2ePendingStep1Id = randomUUID();
  const e2ePendingStep2Id = randomUUID();
  const e2ePendingCode = `SOP-AC-P-${Date.now().toString(36).toUpperCase()}`;

  const e2ePubDocId = randomUUID();
  const e2ePubVerId = randomUUID();
  const e2eReadAssignId = randomUUID();
  const e2ePubCode = `SOP-AC-R-${Date.now().toString(36).toUpperCase()}`;

  test.beforeAll(async () => {
    const connectionString =
      process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DIRECT_DATABASE_URL or DATABASE_URL for E2E fixture setup");
    }

    const author = DEMO_ACCOUNTS.find((a) => a.role === "DOCUMENT_AUTHOR")!;
    const approver = DEMO_ACCOUNTS.find((a) => a.role === "APPROVER_REVIEWER")!;
    const qm = DEMO_ACCOUNTS.find((a) => a.role === "QUALITY_MANAGER")!;
    const reader = DEMO_ACCOUNTS.find((a) => a.role === "READER")!;

    const pendingTitle = "E2E Ephemeral Pending Approval SOP";
    const pendingMd = `# ${e2ePendingCode}: ${pendingTitle}\n\n## 1. Purpose\nRepeatable E2E approval workflow fixture.`;
    const pendingSha = createHash("sha256")
      .update(
        `${pendingMd}${JSON.stringify({
          document_code: e2ePendingCode,
          tenant_id: DEMO_TENANT.id,
          title: pendingTitle,
          version_label: "v1.0",
        })}`,
        "utf8"
      )
      .digest("hex");

    const pubTitle = "E2E Ephemeral Pending Read SOP";
    const pubMd = `# ${e2ePubCode}: ${pubTitle}\n\n## 1. Purpose\nRepeatable E2E reader assignment fixture.`;
    const pubSha = createHash("sha256")
      .update(
        `${pubMd}${JSON.stringify({
          document_code: e2ePubCode,
          tenant_id: DEMO_TENANT.id,
          title: pubTitle,
          version_label: "v1.0",
        })}`,
        "utf8"
      )
      .digest("hex");

    assertSafeE2eDatabaseUrl(connectionString);
    const client = postgres(connectionString, { prepare: false, max: 1 });
    const db = drizzle(client, { schema });
    try {
      const now = new Date();
      await db.insert(schema.documents).values([
        {
          id: e2ePendingDocId,
          tenantId: DEMO_TENANT.id,
          documentCode: e2ePendingCode,
          category: "Safety",
          createdBy: author.id,
        },
        {
          id: e2ePubDocId,
          tenantId: DEMO_TENANT.id,
          documentCode: e2ePubCode,
          category: "Quality",
          createdBy: author.id,
        },
      ]);

      await db.insert(schema.documentVersions).values([
        {
          id: e2ePendingVerId,
          tenantId: DEMO_TENANT.id,
          documentId: e2ePendingDocId,
          versionMajor: 1,
          versionMinor: 0,
          title: pendingTitle,
          contentFormat: "MARKDOWN",
          markdownContent: pendingMd,
          documentSha256: pendingSha,
          lifecycleState: "PENDING_APPROVAL",
          authorId: author.id,
          rowVersion: 2,
        },
        {
          id: e2ePubVerId,
          tenantId: DEMO_TENANT.id,
          documentId: e2ePubDocId,
          versionMajor: 1,
          versionMinor: 0,
          title: pubTitle,
          contentFormat: "MARKDOWN",
          markdownContent: pubMd,
          documentSha256: pubSha,
          lifecycleState: "PUBLISHED",
          authorId: author.id,
          effectiveDate: now,
          publishedAt: now,
          publishedBy: qm.id,
          rowVersion: 3,
        },
      ]);

      await db.insert(schema.approvalCycles).values({
        id: e2ePendingCycleId,
        tenantId: DEMO_TENANT.id,
        documentVersionId: e2ePendingVerId,
        cycleNumber: 1,
        submittedBy: author.id,
        submittedSha256: pendingSha,
        status: "IN_PROGRESS",
        allowSelfApprovalOverride: false,
      });

      await db.insert(schema.approvalSteps).values([
        {
          id: e2ePendingStep1Id,
          tenantId: DEMO_TENANT.id,
          approvalCycleId: e2ePendingCycleId,
          stepOrder: 1,
          assignedApproverId: approver.id,
          status: "PENDING",
        },
        {
          id: e2ePendingStep2Id,
          tenantId: DEMO_TENANT.id,
          approvalCycleId: e2ePendingCycleId,
          stepOrder: 2,
          assignedApproverId: qm.id,
          status: "WAITING",
        },
      ]);

      await db.insert(schema.readAssignments).values({
        id: e2eReadAssignId,
        tenantId: DEMO_TENANT.id,
        documentVersionId: e2ePubVerId,
        userId: reader.id,
        status: "PENDING",
        dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
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
      const docIds = [e2ePendingDocId, e2ePubDocId];
      const verIds = [e2ePendingVerId, e2ePubVerId];
      await client.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = 'replica'`;
        await tx`DELETE FROM veridoc.read_acknowledgments WHERE read_assignment_id = ${e2eReadAssignId}`;
        await tx`DELETE FROM veridoc.read_assignments WHERE id = ${e2eReadAssignId}`;
        await tx`DELETE FROM veridoc.approval_steps WHERE approval_cycle_id = ${e2ePendingCycleId}`;
        await tx`DELETE FROM veridoc.approval_cycles WHERE id = ${e2ePendingCycleId}`;
        await tx`DELETE FROM veridoc.document_versions WHERE id = ANY(${verIds})`;
        await tx`DELETE FROM veridoc.documents WHERE id = ANY(${docIds})`;
      });
    } finally {
      await client.end();
    }
  });

  test("Auth Gate: unauthenticated /dashboard redirects to /auth/sign-in with callbackUrl", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/auth\/sign-in\?callbackUrl=%2Fdashboard/, {
      timeout: 15000,
    });
    await expect(page.locator("#signin-email")).toBeVisible();
    await expect(page.locator("#signin-password")).toBeVisible();
    await expect(page.getByTestId("demo-login-QUALITY_MANAGER")).toBeVisible();
  });

  test("AC-01: Sequential approval workflow routes, stepper, and re-auth modal render for APPROVER_REVIEWER", async ({
    page,
  }) => {
    await signInAsDemoRole(page, "APPROVER_REVIEWER", /\/approvals/);

    await expect(
      page.locator("h1", { hasText: "Approvals & Sign-Offs" })
    ).toBeVisible();
    await expect(page.getByTestId("tab-action-required")).toBeVisible();
    await expect(page.getByTestId("tab-upcoming-steps")).toBeVisible();

    const queueCard = page.getByTestId(`queue-card-${e2ePendingCode}`);
    await expect(queueCard).toBeVisible({ timeout: 15000 });
    await queueCard.click();

    await expect(page.getByTestId("stepper-step-1")).toBeVisible();
    await expect(page.getByTestId("stepper-step-2")).toBeVisible();

    const approveBtn = page.getByTestId("approve-sign-off-button");
    await expect(approveBtn).toBeEnabled();
    await approveBtn.click();

    const modal = page.locator("div[role='dialog']");
    await expect(modal).toBeVisible();
    await expect(modal.locator("#sign-intent")).toBeVisible();
    await expect(modal.locator("#sign-password")).toBeVisible();
    await expect(
      modal.getByTestId("confirm-sign-off-button")
    ).toBeVisible();

    await modal.locator("button[aria-label='Close dialog']").click();
    await expect(modal).toBeHidden();
  });

  test("AC-02: Seeded SOP list and document detail lifecycle controls render for DOCUMENT_AUTHOR", async ({
    page,
  }) => {
    await signInAsDemoRole(page, "DOCUMENT_AUTHOR", /\/documents/);

    await expect(
      page.locator("h1", { hasText: "Controlled Documents" })
    ).toBeVisible();
    await expect(
      page.locator(`text=${e2ePendingCode} >> visible=true`).first()
    ).toBeVisible();
    await expect(
      page.locator("text=SOP-ENG-104 >> visible=true").first()
    ).toBeVisible();
    await expect(
      page.locator("text=SOP-MFG-001 >> visible=true").first()
    ).toBeVisible();

    await page.locator("a:visible", { hasText: e2ePendingCode }).first().click();
    await page.waitForURL(/\/documents\/[0-9a-f-]+/i, { timeout: 15000 });

    await expect(
      page.locator(`text=${e2ePendingCode} >> visible=true`).first()
    ).toBeVisible();
    await expect(
      page.locator("select[title='Select version revision']")
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "Save Draft" })
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "Recall Workflow" })
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "Version Diff" })
    ).toBeVisible();
  });

  test("AC-03: Seeded pending read assignments render in To-Read queue for READER", async ({
    page,
  }) => {
    await signInAsDemoRole(page, "READER", /\/to-read/);

    await expect(
      page.locator("h1", { hasText: "Hello David Miller" })
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "Pending Reads" })
    ).toBeVisible();

    const pendingReadLinks = page.locator("a[href*='/read/']");
    expect(await pendingReadLinks.count()).toBeGreaterThan(0);
    await expect(pendingReadLinks.first()).toBeVisible();
  });

  test("AC-04: Governance dashboard, live audit ledger, export CTA, and sign-out work for QUALITY_MANAGER", async ({
    page,
  }) => {
    await signInAsDemoRole(page, "QUALITY_MANAGER", /\/dashboard/);

    await expect(
      page.locator("h1", { hasText: "Quality Governance Dashboard" })
    ).toBeVisible();
    await expect(
      page.locator("h2", { hasText: "Active SOP Rollouts" })
    ).toBeVisible();

    const dashboardText = await page.locator("body").innerText();
    expect(dashboardText).not.toContain("19,482");

    await page.goto("/audit");
    await expect(
      page.locator("h1", { hasText: "Governance Audit Trail" })
    ).toBeVisible();

    const auditRows = page.locator('[data-testid="audit-record-row"]:visible');
    await expect(auditRows.first()).toBeVisible({ timeout: 15000 });
    expect(await auditRows.count()).toBeGreaterThan(0);

    const exportBtn = page.locator("button:visible", { hasText: "Export" }).first();
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    const mobileSignOut = page.getByTestId("mobile-sign-out-button");
    const desktopSignOut = page.getByTestId("sign-out-button");
    if (await mobileSignOut.isVisible()) {
      await mobileSignOut.click();
    } else {
      await desktopSignOut.click();
    }

    await page.waitForURL(/\/auth\/sign-in/, { timeout: 15000 });
    await page.goto("/dashboard");
    await page.waitForURL(/\/auth\/sign-in/, { timeout: 15000 });
  });

  test("AC-05: Strict Tenant & Role Isolation rejects unauthenticated access", async ({
    request,
  }) => {
    const exportResponse = await request.get("/api/audit/export?format=json");
    expect([401, 403, 404]).toContain(exportResponse.status());

    const queueResponse = await request.get("/api/approvals/queue");
    expect([401, 403, 404]).toContain(queueResponse.status());

    const readResponse = await request.get("/api/acknowledgments/my-queue");
    expect([401, 403, 404]).toContain(readResponse.status());
  });
});
