import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import nextConfig, { securityHeaders } from "../../../next.config";
import { middleware } from "../../../src/middleware";

describe("Production Security Headers (DEC-07, §8.1)", () => {
  it("should define all mandatory HTTP security headers in next.config.ts", () => {
    const headerKeys = securityHeaders.map((h) => h.key);
    expect(headerKeys).toContain("Strict-Transport-Security");
    expect(headerKeys).toContain("X-Frame-Options");
    expect(headerKeys).toContain("X-Content-Type-Options");
    expect(headerKeys).toContain("Referrer-Policy");
    expect(headerKeys).toContain("Permissions-Policy");
    expect(headerKeys).toContain("Content-Security-Policy");
  });

  it("should configure Strict-Transport-Security with 2-year HSTS preload", () => {
    const hsts = securityHeaders.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts?.value).toBe("max-age=63072000; includeSubDomains; preload");
  });

  it("should configure X-Frame-Options to DENY clickjacking", () => {
    const xfo = securityHeaders.find((h) => h.key === "X-Frame-Options");
    expect(xfo?.value).toBe("DENY");
  });

  it("should configure X-Content-Type-Options to nosniff", () => {
    const nosniff = securityHeaders.find((h) => h.key === "X-Content-Type-Options");
    expect(nosniff?.value).toBe("nosniff");
  });

  it("should configure Referrer-Policy to strict-origin-when-cross-origin", () => {
    const referrer = securityHeaders.find((h) => h.key === "Referrer-Policy");
    expect(referrer?.value).toBe("strict-origin-when-cross-origin");
  });

  it("should configure Content-Security-Policy with frame-src allowing signed PDF previews", () => {
    const csp = securityHeaders.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    const value = csp!.value;

    expect(value).toContain("default-src 'self'");
    expect(value).toContain("frame-src 'self' blob: https://*.supabase.co");
    expect(value).toContain("object-src 'self' blob: https://*.supabase.co");
    expect(value).toContain("frame-ancestors 'none'");
  });

  it("should return security headers array for all routes (/:path*) in nextConfig.headers()", async () => {
    if (typeof nextConfig.headers !== "function") {
      throw new Error("nextConfig.headers must be an async function");
    }

    const headersConfig = await nextConfig.headers();
    expect(headersConfig).toHaveLength(1);
    expect(headersConfig[0].source).toBe("/:path*");
    expect(headersConfig[0].headers).toEqual(securityHeaders);
  });

  it("should set all security headers on NextResponse via middleware", () => {
    const req = new NextRequest("http://localhost:3000/documents");
    const res = middleware(req);

    expect(res.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload"
    );
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "frame-src 'self' blob: https://*.supabase.co"
    );
  });
});
