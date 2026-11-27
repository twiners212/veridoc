import { config } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { test, expect } from "@playwright/test";
import * as schema from "../src/db/schema";
import { DEMO_ACCOUNTS, DEMO_TENANT } from "../src/lib/auth/demo-accounts";
import { assertSafeE2eDatabaseUrl } from "./helpers/e2e-db-guard";

config({ path: ".env.local" });
config();

test.describe("Navigation Optimization & Shared Layout (SSR + Client Transitions)", () => {
  const ephemeralUserId = randomUUID();
  const ephemeralEmail = `e2e-nav-deact-${Date.now().toString(36)}@veridoc.test`;
  const ephemeralPassword = "NavOptLockout!2026";

  const e2ePendingDocId = randomUUID();
  const e2ePendingVerId = randomUUID();
  const e2ePendingCycleId = randomUUID();
  const e2ePendingStep1Id = randomUUID();
  const e2ePendingStep2Id = randomUUID();
  const e2ePendingCode = `SOP-NAV-P-${Date.now().toString(36).toUpperCase()}`;

  const e2ePubDocId = randomUUID();
  const e2ePubVerId = randomUUID();
  const e2eReadAssignId = randomUUID();
  const e2ePubCode = `SOP-NAV-R-${Date.now().toString(36).toUpperCase()}`;

  test.beforeAll(async () => {
    const connectionString =
      process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) return;

    const author = DEMO_ACCOUNTS.find((a) => a.role === "DOCUMENT_AUTHOR")!;
    const approver = DEMO_ACCOUNTS.find((a) => a.role === "APPROVER_REVIEWER")!;
    const qm = DEMO_ACCOUNTS.find((a) => a.role === "QUALITY_MANAGER")!;
    const reader = DEMO_ACCOUNTS.find((a) => a.role === "READER")!;

    const pendingTitle = "E2E Nav Pending Approval SOP";
    const pendingMd = `# ${e2ePendingCode}: ${pendingTitle}\n\nRepeatable nav fixture.`;
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

    const pubTitle = "E2E Nav Reader SOP";
    const pubMd = `# ${e2ePubCode}: ${pubTitle}\n\nRepeatable reader fixture.`;
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
      const passwordHash = await hashPassword(ephemeralPassword);
      await db.insert(schema.users).values({
        id: ephemeralUserId,
        name: "E2E Ephemeral Reader",
        email: ephemeralEmail,
        emailVerified: true,
      });
      await db.insert(schema.accounts).values({
        userId: ephemeralUserId,
        accountId: ephemeralUserId,
        providerId: "credential",
        password: passwordHash,
      });
      await db.insert(schema.tenantMemberships).values({
        tenantId: DEMO_TENANT.id,
        userId: ephemeralUserId,
        role: "READER",
        status: "ACTIVE",
      });

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
    const db = drizzle(client, { schema });
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
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, ephemeralUserId));
      await db
        .delete(schema.tenantMemberships)
        .where(eq(schema.tenantMemberships.userId, ephemeralUserId));
      await db
        .delete(schema.accounts)
        .where(eq(schema.accounts.userId, ephemeralUserId));
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, ephemeralUserId));
    } finally {
      await client.end();
    }
  });

  test("SSR hydrates /approvals & /audit without redundant mount API fetch, keeps mobile nav mounted, and renders /read/* full-bleed for READER", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto("/auth/sign-in");
    const adminBtn = page.getByTestId("demo-login-WORKSPACE_ADMIN");
    await expect(adminBtn).toBeVisible();
    await adminBtn.click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    await expect(
      page.locator("h1", { hasText: "Quality Governance Dashboard" })
    ).toBeVisible();

    const approvalQueueRequests: string[] = [];
    const auditLogRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/approvals/queue")) {
        approvalQueueRequests.push(req.url());
      }
      if (req.url().includes("/api/audit/logs")) {
        auditLogRequests.push(req.url());
      }
    });

    const mobileNav = page.locator("nav[aria-label='Mobile Navigation']");
    await expect(mobileNav).toBeVisible();

    await mobileNav.locator("a[href='/approvals']").click();
    await page.waitForURL(/\/approvals/, { timeout: 15000 });

    await expect(
      page.locator("h1", { hasText: "Approvals & Sign-Offs" })
    ).toBeVisible();

    // Verify SSR initialItems rendered immediately with 0 redundant mount API requests
    await expect(page.getByTestId(`queue-card-${e2ePendingCode}`)).toBeVisible({
      timeout: 15000,
    });
    expect(approvalQueueRequests).toHaveLength(0);

    // Switching to Upcoming Sequential Steps tab triggers 1 client API request
    await page.getByTestId("tab-upcoming-steps").click();
    await expect
      .poll(() => approvalQueueRequests.length, { timeout: 10000 })
      .toBe(1);
    expect(approvalQueueRequests[0]).toContain("scope=upcoming");

    // Navigate across sibling routes in shared layout
    await mobileNav.locator("a[href='/documents']").click();
    await page.waitForURL(/\/documents/, { timeout: 15000 });
    await expect(
      page.locator("h1", { hasText: "Controlled Documents" })
    ).toBeVisible();

    await mobileNav.locator("a[href='/settings']").click();
    await page.waitForURL(/\/settings/, { timeout: 15000 });
    await expect(
      page.locator("h1", { hasText: "Workspace Administration" })
    ).toBeVisible();

    // Verify /audit renders SSR initialItems without an immediate mount /api/audit/logs request
    await page.goto("/audit");
    await expect(
      page.locator("h1", { hasText: "Governance Audit Trail" })
    ).toBeVisible();
    await page.waitForTimeout(400);
    expect(auditLogRequests).toHaveLength(0);

    // Strictly verify /read/* full-bleed layout as seeded READER (no silent conditional skip)
    await page.goto("/auth/sign-in");
    await page.getByTestId("demo-login-READER").click();
    await page.waitForURL(/\/to-read/, { timeout: 15000 });

    const readLink = page.locator("a[href*='/read/']").first();
    await expect(readLink).toBeVisible({ timeout: 15000 });
    await readLink.click();
    await page.waitForURL(/\/read\/[0-9a-f-]+/i, { timeout: 15000 });

    await expect(
      page.locator("aside[aria-label='Document Acknowledgment Bar']")
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("nav[aria-label='Main Navigation']")
    ).toHaveCount(0);
    await expect(
      page.locator("nav[aria-label='Mobile Navigation']")
    ).toHaveCount(0);
  });

  test("desktop sidebar stays mounted across all 6 workspace routes without remounting", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/auth/sign-in");
    await page.getByTestId("demo-login-WORKSPACE_ADMIN").click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    const desktopNav = page.locator("nav[aria-label='Main Navigation']");
    await expect(desktopNav).toBeVisible();

    // Mark the persistent sidebar DOM element so we can prove it never unmounts across route clicks
    await page.evaluate(() => {
      const aside = document.querySelector("aside");
      if (aside) {
        aside.setAttribute("data-persistent-shell", "true");
      }
    });

    const routeChecks: Array<{ href: string; heading: string }> = [
      { href: "/documents", heading: "Controlled Documents" },
      { href: "/approvals", heading: "Approvals & Sign-Offs" },
      { href: "/audit", heading: "Governance Audit Trail" },
      { href: "/settings", heading: "Workspace Administration" },
      { href: "/dashboard", heading: "Quality Governance Dashboard" },
    ];

    for (const { href, heading } of routeChecks) {
      await desktopNav.locator(`a[href='${href}']`).click();
      await page.waitForURL(new RegExp(href), { timeout: 15000 });
      await expect(page.locator("h1", { hasText: heading })).toBeVisible();
      const persisted = await page.evaluate(
        () =>
          document
            .querySelector("aside")
            ?.getAttribute("data-persistent-shell") === "true"
      );
      expect(persisted).toBe(true);
    }
  });

  test("deactivated user is locked out immediately even while 60s cookieCache is warm", async ({
    page,
  }) => {
    await page.goto("/auth/sign-in");
    await page.fill("#signin-email", ephemeralEmail);
    await page.fill("#signin-password", ephemeralPassword);
    await page.locator("button[type='submit']").click();
    await page.waitForURL(/\/to-read/, { timeout: 15000 });

    // Confirm warm cookieCache allows normal sibling navigation while ACTIVE
    await page.goto("/documents");
    await expect(
      page.locator("h1", { hasText: "Controlled Documents" })
    ).toBeVisible();

    // Deactivate membership directly in DB while 60s session cookieCache is still warm
    const connectionString =
      process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DIRECT_DATABASE_URL or DATABASE_URL");
    }
    assertSafeE2eDatabaseUrl(connectionString);
    const client = postgres(connectionString, { prepare: false, max: 1 });
    const db = drizzle(client, { schema });
    try {
      await db
        .update(schema.tenantMemberships)
        .set({ status: "DEACTIVATED" })
        .where(eq(schema.tenantMemberships.userId, ephemeralUserId));
    } finally {
      await client.end();
    }

    // Immediate lockout on next navigation (redirects to /auth/sign-in)
    await page.goto("/to-read");
    await page.waitForURL(/\/auth\/sign-in/, { timeout: 15000 });
  });
});
