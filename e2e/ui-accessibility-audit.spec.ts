import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

type ThemeMode = "light" | "dark";
type DemoRole = "WORKSPACE_ADMIN" | "APPROVER_REVIEWER" | "READER";

async function signInAsDemoRole(
  page: Page,
  role: DemoRole,
  expectedUrl: RegExp
): Promise<void> {
  await page.goto("/auth/sign-in");
  const demoBtn = page.getByTestId(`demo-login-${role}`);
  await expect(demoBtn).toBeVisible({ timeout: 15000 });
  await demoBtn.click();
  await page.waitForURL(expectedUrl, { timeout: 30000 });
}

async function auditRoute(
  page: Page,
  options: {
    routeLabel: string;
    viewportWidth: number;
    isMobile: boolean;
    checkRightEdgeButtons?: string[];
  }
): Promise<void> {
  // Wait for client hydration & GSAP stagger animations (0.35s) to settle at full opacity
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(450);

  const axeResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(
    axeResults.violations,
    `Axe WCAG 2.1 AA violations on ${options.routeLabel}: ${JSON.stringify(
      axeResults.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => n.target),
      })),
      null,
      2
    )}`
  ).toEqual([]);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `Horizontal overflow detected on ${options.routeLabel}: scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth}`
  ).toBeLessThanOrEqual(overflow.innerWidth);

  for (const label of options.checkRightEdgeButtons ?? []) {
    const cta = page.locator("button, a", { hasText: label }).first();
    if ((await cta.count()) > 0 && (await cta.isVisible())) {
      if (options.isMobile) {
        await cta.scrollIntoViewIfNeeded();
        await expect(
          cta,
          `Button "${label}" should be visible after scrolling on ${options.routeLabel}`
        ).toBeVisible();
        await expect(
          cta,
          `Button "${label}" should be enabled on ${options.routeLabel}`
        ).toBeEnabled();
        const postScrollOverflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(
          postScrollOverflow.scrollWidth,
          `Horizontal overflow after scrolling "${label}" on ${options.routeLabel}`
        ).toBeLessThanOrEqual(postScrollOverflow.innerWidth);
      } else {
        const box = await cta.boundingBox();
        if (box) {
          expect(
            box.x,
            `Button "${label}" clipped on left edge on ${options.routeLabel}`
          ).toBeGreaterThanOrEqual(0);
          expect(
            box.x + box.width,
            `Button "${label}" clipped on right edge on ${options.routeLabel}`
          ).toBeLessThanOrEqual(options.viewportWidth + 1);
        }
      }
    }
  }

  if (options.isMobile) {
    // Check visible header interactive controls meet >= 44px touch target height
    const headerControls = page.locator(
      "header:visible button, header:visible a[aria-label]"
    );
    const headerCount = await headerControls.count();
    for (let i = 0; i < headerCount; i++) {
      const ctrl = headerControls.nth(i);
      if (await ctrl.isVisible()) {
        const box = await ctrl.boundingBox();
        if (box) {
          expect(
            box.height,
            `Header control #${i} height < 44px on ${options.routeLabel}`
          ).toBeGreaterThanOrEqual(44);
        }
      }
    }

    // Check MobileBottomNav links meet >= 44px height when present
    const mobileNavLinks = page.locator("nav[aria-label='Mobile Navigation'] a");
    const navCount = await mobileNavLinks.count();
    for (let i = 0; i < navCount; i++) {
      const link = mobileNavLinks.nth(i);
      if (await link.isVisible()) {
        const box = await link.boundingBox();
        if (box) {
          expect(
            box.height,
            `Mobile nav link #${i} height < 44px on ${options.routeLabel}`
          ).toBeGreaterThanOrEqual(44);
        }
      }
    }
  }
}

function registerA11ySuite(params: {
  label: string;
  viewport: { width: number; height: number };
  isMobile: boolean;
  mode: ThemeMode;
}) {
  test.describe(`UI & A11y Audit — ${params.label} (${params.mode})`, () => {
    test.use({
      viewport: params.viewport,
      isMobile: params.isMobile,
      hasTouch: params.isMobile,
    });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((theme) => {
        window.localStorage.setItem("veridoc-theme", theme);
      }, params.mode);
    });

    test("audits WORKSPACE_ADMIN routes, READER routes, and modal Escape handling (read-only)", async ({
      page,
    }) => {
      test.setTimeout(120000);

      // 1. WORKSPACE_ADMIN workspace routes
      await signInAsDemoRole(page, "WORKSPACE_ADMIN", /\/dashboard/);
      await expect(
        page.locator("h1", { hasText: "Quality Governance Dashboard" })
      ).toBeVisible();
      await auditRoute(page, {
        routeLabel: `/dashboard [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
        checkRightEdgeButtons: ["Audit Packet"],
      });

      await page.goto("/documents");
      await expect(
        page.locator("h1", { hasText: "Controlled Documents" })
      ).toBeVisible();
      await auditRoute(page, {
        routeLabel: `/documents [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
        checkRightEdgeButtons: ["Workspace"],
      });

      const firstDocLink = page.locator("a[href^='/documents/']").first();
      await expect(firstDocLink).toBeVisible({ timeout: 15000 });
      await firstDocLink.click();
      await page.waitForURL(/\/documents\/[0-9a-f-]+/i, { timeout: 15000 });
      await auditRoute(page, {
        routeLabel: `/documents/[id] [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
      });

      await page.goto("/approvals");
      await expect(
        page.locator("h1", { hasText: "Approvals & Sign-Offs" })
      ).toBeVisible();
      await auditRoute(page, {
        routeLabel: `/approvals [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
      });

      await page.goto("/audit");
      await expect(
        page.locator("h1", { hasText: "Governance Audit Trail" })
      ).toBeVisible();
      await auditRoute(page, {
        routeLabel: `/audit [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
      });

      await page.goto("/settings");
      await expect(
        page.locator("h1", { hasText: "Workspace Administration" })
      ).toBeVisible();
      await auditRoute(page, {
        routeLabel: `/settings [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
      });

      // 2. Verify SignOffReauthModal opens on Approve click & closes cleanly on Escape
      await signInAsDemoRole(page, "APPROVER_REVIEWER", /\/approvals/);
      await expect(
        page.locator("h1", { hasText: "Approvals & Sign-Offs" })
      ).toBeVisible();
      await expect(
        page.getByTestId("approve-sign-off-button").or(page.getByText("Queue Clear"))
      ).toBeVisible({ timeout: 15000 });

      let approveBtn = page.getByTestId("approve-sign-off-button");
      if ((await approveBtn.count()) === 0 || !(await approveBtn.isEnabled())) {
        await signInAsDemoRole(page, "WORKSPACE_ADMIN", /\/dashboard/);
        await page.goto("/approvals");
        await expect(
          page.locator("h1", { hasText: "Approvals & Sign-Offs" })
        ).toBeVisible();
        approveBtn = page.getByTestId("approve-sign-off-button");
      }
      await expect(approveBtn).toBeVisible({ timeout: 15000 });
      await expect(approveBtn).toBeEnabled();
      await approveBtn.click();

      const signOffDialog = page.locator("div[role='dialog']");
      await expect(signOffDialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(signOffDialog).toBeHidden();

      // 3. READER routes (strictly read-only: do NOT submit acknowledgment)
      await signInAsDemoRole(page, "READER", /\/to-read/);
      await expect(page.locator("h1").first()).toBeVisible();
      await auditRoute(page, {
        routeLabel: `/to-read [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
      });

      await page.goto("/documents");
      await expect(
        page.locator("h1", { hasText: "Controlled Documents" })
      ).toBeVisible();
      await auditRoute(page, {
        routeLabel: `/documents (READER) [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
        checkRightEdgeButtons: ["Workspace"],
      });

      await page.goto("/to-read");
      const readLink = page.locator("a[href*='/read/']").first();
      await expect(readLink).toBeVisible({ timeout: 15000 });
      await readLink.click();
      await page.waitForURL(/\/read\/[0-9a-f-]+/i, { timeout: 15000 });
      await expect(
        page.locator("aside[aria-label='Document Acknowledgment Bar']")
      ).toBeVisible({ timeout: 15000 });
      await auditRoute(page, {
        routeLabel: `/read/[id] [${params.label} ${params.mode}]`,
        viewportWidth: params.viewport.width,
        isMobile: params.isMobile,
      });
    });
  });
}

for (const mode of ["light", "dark"] as const) {
  registerA11ySuite({
    label: "Desktop 1280x800",
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    mode,
  });

  registerA11ySuite({
    label: "Mobile 375x812",
    viewport: { width: 375, height: 812 },
    isMobile: true,
    mode,
  });
}
