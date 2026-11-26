import { describe, it, expect, afterEach } from "vitest";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  DEMO_TENANT,
  getDefaultLandingRouteForRole,
  getDemoAccountByRole,
  getSafeCallbackUrl,
  isDemoLoginEnabled,
} from "@/lib/auth/demo-accounts";
import type { WorkspaceRole } from "@/types/roles";

const ALL_ROLES: readonly WorkspaceRole[] = [
  "WORKSPACE_ADMIN",
  "QUALITY_MANAGER",
  "DOCUMENT_AUTHOR",
  "APPROVER_REVIEWER",
  "READER",
];

describe("Demo Login & Role Routing Unit Tests", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableDemoLogin = process.env.ENABLE_DEMO_LOGIN;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
    }

    if (originalEnableDemoLogin === undefined) {
      Reflect.deleteProperty(process.env, "ENABLE_DEMO_LOGIN");
    } else {
      Reflect.set(process.env, "ENABLE_DEMO_LOGIN", originalEnableDemoLogin);
    }
  });

  describe("getDefaultLandingRouteForRole", () => {
    it("maps all 5 WorkspaceRole values to their approved landing routes", () => {
      expect(getDefaultLandingRouteForRole("WORKSPACE_ADMIN")).toBe("/dashboard");
      expect(getDefaultLandingRouteForRole("QUALITY_MANAGER")).toBe("/dashboard");
      expect(getDefaultLandingRouteForRole("DOCUMENT_AUTHOR")).toBe("/documents");
      expect(getDefaultLandingRouteForRole("APPROVER_REVIEWER")).toBe("/approvals");
      expect(getDefaultLandingRouteForRole("READER")).toBe("/to-read");
    });
  });

  describe("isDemoLoginEnabled", () => {
    it("returns false in production when ENABLE_DEMO_LOGIN is unset", () => {
      Reflect.set(process.env, "NODE_ENV", "production");
      Reflect.deleteProperty(process.env, "ENABLE_DEMO_LOGIN");

      expect(isDemoLoginEnabled()).toBe(false);
    });

    it("returns false in production when ENABLE_DEMO_LOGIN is 'false'", () => {
      Reflect.set(process.env, "NODE_ENV", "production");
      Reflect.set(process.env, "ENABLE_DEMO_LOGIN", "false");

      expect(isDemoLoginEnabled()).toBe(false);
    });

    it("returns true in production when ENABLE_DEMO_LOGIN is explicitly 'true'", () => {
      Reflect.set(process.env, "NODE_ENV", "production");
      Reflect.set(process.env, "ENABLE_DEMO_LOGIN", "true");

      expect(isDemoLoginEnabled()).toBe(true);
    });

    it("returns true in development regardless of ENABLE_DEMO_LOGIN", () => {
      Reflect.set(process.env, "NODE_ENV", "development");
      Reflect.deleteProperty(process.env, "ENABLE_DEMO_LOGIN");

      expect(isDemoLoginEnabled()).toBe(true);
    });

    it("returns true in test regardless of ENABLE_DEMO_LOGIN", () => {
      Reflect.set(process.env, "NODE_ENV", "test");
      Reflect.deleteProperty(process.env, "ENABLE_DEMO_LOGIN");

      expect(isDemoLoginEnabled()).toBe(true);
    });
  });

  describe("DEMO_ACCOUNTS completeness and consistency", () => {
    it("covers every WorkspaceRole exactly once with unique emails, IDs, and valid landing routes", () => {
      expect(DEMO_ACCOUNTS).toHaveLength(ALL_ROLES.length);

      const roles = DEMO_ACCOUNTS.map((account) => account.role);
      const emails = DEMO_ACCOUNTS.map((account) => account.email.toLowerCase());
      const ids = DEMO_ACCOUNTS.map((account) => account.id);

      expect(new Set(roles).size).toBe(ALL_ROLES.length);
      expect(new Set(emails).size).toBe(ALL_ROLES.length);
      expect(new Set(ids).size).toBe(ALL_ROLES.length);

      for (const role of ALL_ROLES) {
        const account = getDemoAccountByRole(role);
        expect(account.role).toBe(role);
        expect(account.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(account.name.trim().length).toBeGreaterThan(0);
        expect(account.roleLabel.trim().length).toBeGreaterThan(0);
        expect(account.description.trim().length).toBeGreaterThan(0);
        expect(account.landingRoute).toBe(getDefaultLandingRouteForRole(role));
      }
    });

    it("defines valid demo tenant metadata and non-empty demo password", () => {
      expect(DEMO_TENANT.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(DEMO_TENANT.name).toBe("Apex Manufacturing");
      expect(DEMO_TENANT.slug).toBe("apex-manufacturing");
      expect(DEMO_PASSWORD.length).toBeGreaterThanOrEqual(12);
    });

    it("throws on unknown workspace role in getDemoAccountByRole", () => {
      expect(() => getDemoAccountByRole("UNKNOWN_ROLE" as WorkspaceRole)).toThrow(
        /Unknown demo workspace role/
      );
    });
  });

  describe("getSafeCallbackUrl open-redirect protection", () => {
    it("allows safe relative workspace paths and preserves query/hash", () => {
      expect(getSafeCallbackUrl("/dashboard")).toBe("/dashboard");
      expect(getSafeCallbackUrl("/documents?tab=draft#top")).toBe(
        "/documents?tab=draft#top"
      );
      expect(getSafeCallbackUrl("  /approvals  ")).toBe("/approvals");
    });

    it("rejects protocol-relative, absolute, backslash, control-char, and sign-in URLs", () => {
      const dangerousPayloads = [
        "",
        "//evil.com",
        "///evil.com",
        "/\\evil.com",
        "/\\/evil.com",
        "/\\tevil.com",
        "/\u0000//evil.com",
        "https://evil.com",
        "http://evil.com",
        "javascript:alert(1)",
        "/auth/sign-in",
        "/auth/sign-in?callbackUrl=/dashboard",
        "/..//evil.com",
        "/a/..//evil.com",
      ];

      for (const payload of dangerousPayloads) {
        expect(getSafeCallbackUrl(payload)).toBeNull();
      }
    });
  });
});
