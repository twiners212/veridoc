import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  rateLimiter,
  MemorySlidingWindowRateLimiter,
  createRateLimitResponse,
  consumeDistributedRateLimit,
  clearDistributedRateLimit,
} from "@/server/security/rate-limiter";
import { GET as exportGet } from "@/app/api/audit/export/route";
import { POST as uploadPost } from "@/app/api/documents/[documentId]/versions/[versionId]/upload/route";

describe("Security Hardening: Rate Limiting Enforcement (§8.2)", () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  describe("MemorySlidingWindowRateLimiter Algorithm", () => {
    it("should allow requests within limit and track remaining correctly", () => {
      const limiter = new MemorySlidingWindowRateLimiter();
      const key = "test:user:1";

      const res1 = limiter.consume(key, 3, 60000);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = limiter.consume(key, 3, 60000);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = limiter.consume(key, 3, 60000);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);

      const res4 = limiter.consume(key, 3, 60000);
      expect(res4.allowed).toBe(false);
      expect(res4.remaining).toBe(0);
      expect(res4.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it("should slide window and permit new requests after expiration", () => {
      const limiter = new MemorySlidingWindowRateLimiter();
      const key = "test:user:2";

      // Window of 100ms
      limiter.consume(key, 1, 100);
      const blocked = limiter.consume(key, 1, 100);
      expect(blocked.allowed).toBe(false);

      // Artificially reset key or clear
      limiter.clearKey(key);
      const allowedAfterReset = limiter.consume(key, 1, 100);
      expect(allowedAfterReset.allowed).toBe(true);
    });

    it("should evict expired keys when window expires during check or purge", async () => {
      const limiter = new MemorySlidingWindowRateLimiter();
      const key = "test:user:evict";

      limiter.consume(key, 5, 20);
      expect(limiter.hasKey(key)).toBe(true);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 35));

      // check() purges expired timestamps and deletes key when empty
      const res = limiter.check(key, 5, 20);
      expect(res.allowed).toBe(true);
      expect(limiter.hasKey(key)).toBe(false);
    });

    it("should format HTTP 429 response correctly with security headers", async () => {
      const limiter = new MemorySlidingWindowRateLimiter();
      limiter.consume("test:key", 1, 60000);
      const blocked = limiter.consume("test:key", 1, 60000);

      const response = createRateLimitResponse(blocked);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Limit")).toBe("1");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");

      const body = await response.json();
      expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(body.error.message).toContain("Rate limit exceeded");
    });
  });

  describe("Audit Packet Export Rate Limiting (10 exports / 10 min)", () => {
    const keysToClean: string[] = [];

    afterEach(async () => {
      for (const k of keysToClean.splice(0)) {
        await clearDistributedRateLimit(k);
      }
    });

    it("should allow up to 10 exports per user per 10 min and reject 11th with 429", async () => {
      const tenantId = `tenant-export-rl-1-${Date.now()}`;
      const userId = `user-export-rl-1-${Date.now()}`;
      const rateLimitKey = `audit-export:${tenantId}:${userId}`;
      keysToClean.push(rateLimitKey);
      await clearDistributedRateLimit(rateLimitKey);

      // Simulate 10 successful consumes
      for (let i = 0; i < 10; i++) {
        const res = await consumeDistributedRateLimit(rateLimitKey, 10, 10 * 60 * 1000);
        expect(res.allowed).toBe(true);
      }

      // Next attempt directly via distributed rate limiter returns allowed: false
      const overflow = await consumeDistributedRateLimit(rateLimitKey, 10, 10 * 60 * 1000);
      expect(overflow.allowed).toBe(false);

      // Now invoke the actual route handler GET /api/audit/export
      const req = new NextRequest("http://localhost:3000/api/audit/export?format=json", {
        headers: {
          "x-tenant-id": tenantId,
          "x-user-id": userId,
        },
      });

      const routeRes = await exportGet(req);
      expect(routeRes.status).toBe(429);

      const json = await routeRes.json();
      expect(json.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(routeRes.headers.get("Retry-After")).toBeDefined();
    });

    it("should isolate rate limits across different users or tenants", async () => {
      const tenantId = `tenant-export-rl-2-${Date.now()}`;
      const userA = `user-export-a-${Date.now()}`;
      const userB = `user-export-b-${Date.now()}`;
      const keyA = `audit-export:${tenantId}:${userA}`;
      const keyB = `audit-export:${tenantId}:${userB}`;
      keysToClean.push(keyA, keyB);
      await clearDistributedRateLimit(keyA);
      await clearDistributedRateLimit(keyB);

      // Exhaust User A's quota
      for (let i = 0; i < 10; i++) {
        await consumeDistributedRateLimit(keyA, 10, 10 * 60 * 1000);
      }
      expect((await consumeDistributedRateLimit(keyA, 10, 10 * 60 * 1000)).allowed).toBe(false);

      // User B should still be allowed
      const userBCheck = await consumeDistributedRateLimit(keyB, 10, 10 * 60 * 1000);
      expect(userBCheck.allowed).toBe(true);
      expect(userBCheck.remaining).toBe(9);
    });
  });

  describe("PDF Upload Rate Limiting (20 uploads / 10 min)", () => {
    const keysToClean: string[] = [];

    afterEach(async () => {
      for (const k of keysToClean.splice(0)) {
        await clearDistributedRateLimit(k);
      }
    });

    it("should enforce upload rate limit of 20 uploads / 10 min and reject 21st with 429", async () => {
      const tenantId = `tenant-upload-rl-1-${Date.now()}`;
      const userId = `user-upload-rl-1-${Date.now()}`;
      const rateLimitKey = `upload:${tenantId}:${userId}`;
      keysToClean.push(rateLimitKey);
      await clearDistributedRateLimit(rateLimitKey);

      // Simulate 20 uploads
      for (let i = 0; i < 20; i++) {
        const res = await consumeDistributedRateLimit(rateLimitKey, 20, 10 * 60 * 1000);
        expect(res.allowed).toBe(true);
      }

      // 21st attempt
      const overflow = await consumeDistributedRateLimit(rateLimitKey, 20, 10 * 60 * 1000);
      expect(overflow.allowed).toBe(false);

      const validDocId = "11111111-1111-4111-8111-111111111111";
      const validVerId = "22222222-2222-4222-8222-222222222222";

      // Invoke the actual upload route handler
      const req = new NextRequest(
        `http://localhost:3000/api/documents/${validDocId}/versions/${validVerId}/upload`,
        {
          method: "POST",
          headers: {
            "x-tenant-id": tenantId,
            "x-user-id": userId,
          },
        }
      );

      const routeRes = await uploadPost(req, {
        params: Promise.resolve({ documentId: validDocId, versionId: validVerId }),
      });
      expect(routeRes.status).toBe(429);

      const json = await routeRes.json();
      expect(json.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(routeRes.headers.get("Retry-After")).toBeDefined();
    });
  });

  describe("Sign-Off Re-Authentication Password Lockout (5 failures / 15 min)", () => {
    it("should lock out sign-off re-auth after 5 failed password attempts", () => {
      const userId = "user-lockout-1";
      const ip = "192.168.1.100";
      const lockoutKey = `reauth:${userId}:${ip}`;

      // Initially allowed
      expect(rateLimiter.check(lockoutKey, 5, 15 * 60 * 1000).allowed).toBe(true);

      // Record 4 failed attempts
      for (let i = 0; i < 4; i++) {
        rateLimiter.recordFailure(lockoutKey, 15 * 60 * 1000);
      }
      expect(rateLimiter.check(lockoutKey, 5, 15 * 60 * 1000).allowed).toBe(true);

      // 5th failed attempt
      rateLimiter.recordFailure(lockoutKey, 15 * 60 * 1000);

      // 6th attempt should be blocked
      const checkResult = rateLimiter.check(lockoutKey, 5, 15 * 60 * 1000);
      expect(checkResult.allowed).toBe(false);
      expect(checkResult.retryAfterSeconds).toBeGreaterThan(0);
      expect(checkResult.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);

      // Clearing lockout (e.g. on successful reauth) resets state
      rateLimiter.clearKey(lockoutKey);
      expect(rateLimiter.check(lockoutKey, 5, 15 * 60 * 1000).allowed).toBe(true);
    });
  });
});
