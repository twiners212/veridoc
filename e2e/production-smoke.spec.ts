import { test, expect } from "@playwright/test";

test.describe("Production Smoke (Read-Only)", () => {
  test("verifies health, production CSP/security headers, ledger integrity, PDF signed preview, and mobile reader", async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);

    // 1. Deep Health Check & Production Security Headers
    const healthRes = await request.get("/api/health?deep=true");
    expect(healthRes.status()).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson).toMatchObject({
      status: "ok",
      db: "connected",
    });

    const headers = healthRes.headers();
    const csp = headers["content-security-policy"] || "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(headers["strict-transport-security"]).toBe(
      "max-age=63072000; includeSubDomains; preload"
    );
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // Track console errors and >=500 responses across authenticated navigation
    const consoleErrors: string[] = [];
    const serverErrors: Array<{ url: string; status: number }> = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 500) {
        serverErrors.push({ url: res.url(), status: res.status() });
      }
    });

    // 2. Sign in as QUALITY_MANAGER & verify governance routes
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/auth/sign-in");
    const qmBtn = page.getByTestId("demo-login-QUALITY_MANAGER");
    await expect(qmBtn).toBeVisible({ timeout: 15000 });
    await qmBtn.click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    const qmRoutes = [
      { path: "/dashboard", heading: "Quality Governance Dashboard" },
      { path: "/documents", heading: "Controlled Documents" },
      { path: "/approvals", heading: "Approvals & Sign-Offs" },
      { path: "/audit", heading: "Governance Audit Trail" },
    ];

    for (const route of qmRoutes) {
      const res = await page.goto(route.path);
      expect(res?.status(), `Unexpected HTTP status on ${route.path}`).toBe(200);
      await expect(page.locator("h1", { hasText: route.heading })).toBeVisible({
        timeout: 15000,
      });
    }

    // 3. Verify Audit Chain Integrity & JSON Export
    const verifyRes = await page.request.get("/api/audit/verify");
    expect(verifyRes.status()).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.data?.verified).toBe(true);

    const exportRes = await page.request.get("/api/audit/export?format=json");
    expect(exportRes.status()).toBe(200);
    const exportJson = await exportRes.json();
    expect(exportJson.verification?.chainVerified).toBe(true);

    // 4. Verify Seeded PDF SOP Signed Preview URL & %PDF- magic bytes
    await page.goto("/documents");
    const pdfRowLink = page
      .locator("tr", { hasText: "SOP-SAF-402" })
      .locator("a[href^='/documents/']")
      .first();
    const fallbackPdfLink = page
      .locator("tr", { hasText: "PDF" })
      .locator("a[href^='/documents/']")
      .first();
    const targetDocLink =
      (await pdfRowLink.count()) > 0 ? pdfRowLink : fallbackPdfLink;

    await expect(targetDocLink).toBeVisible({ timeout: 15000 });
    const docHref = await targetDocLink.getAttribute("href");
    expect(docHref).toMatch(/^\/documents\/[0-9a-f-]+$/i);
    const docId = docHref!.split("/").pop()!;

    await page.goto(docHref!);
    const versionSelect = page.locator("select[title='Select version revision']");
    await expect(versionSelect).toBeVisible({ timeout: 15000 });
    const verId = await versionSelect.inputValue();
    expect(verId).toMatch(/^[0-9a-f-]+$/i);

    const previewRes = await page.request.get(
      `/api/documents/${docId}/versions/${verId}/preview-url`
    );
    expect(previewRes.status()).toBe(200);
    const previewJson = await previewRes.json();
    const signedUrl: string | undefined = previewJson.data?.signedUrl;
    expect(signedUrl).toBeTruthy();
    expect(() => new URL(signedUrl!)).not.toThrow();

    const pdfFetchRes = await request.get(signedUrl!);
    expect(pdfFetchRes.status()).toBe(200);
    const pdfBytes = await pdfFetchRes.body();
    expect(pdfBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // 5. Sign in as READER at 375x812 & verify /to-read + /read/[id] (read-only)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/auth/sign-in");
    const readerBtn = page.getByTestId("demo-login-READER");
    await expect(readerBtn).toBeVisible({ timeout: 15000 });
    await readerBtn.click();
    await page.waitForURL(/\/to-read/, { timeout: 30000 });

    const readLink = page.locator("a[href*='/read/']").first();
    await expect(readLink).toBeVisible({ timeout: 15000 });
    await readLink.click();
    await page.waitForURL(/\/read\/[0-9a-f-]+/i, { timeout: 15000 });
    await expect(
      page.locator("aside[aria-label='Document Acknowledgment Bar']")
    ).toBeVisible({ timeout: 15000 });

    expect(consoleErrors, `Console errors: ${consoleErrors.join("; ")}`).toEqual([]);
    expect(serverErrors, `Server >=500 errors: ${JSON.stringify(serverErrors)}`).toEqual(
      []
    );
  });
});
