import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, type DrizzleDb } from "@/db";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetUnixSeconds: number;
}

export class MemorySlidingWindowRateLimiter {
  private cache = new Map<string, number[]>();
  private keyExpiries = new Map<string, number>();

  private pruneExpiredKeys(now: number, skipKey?: string): void {
    for (const [k, exp] of this.keyExpiries.entries()) {
      if (k !== skipKey && exp <= now) {
        this.cache.delete(k);
        this.keyExpiries.delete(k);
      }
    }
  }

  /**
   * Evaluates the sliding window and records a new consumption hit if within quota.
   */
  public consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (this.cache.get(key) || []).filter((t) => t > windowStart);

    // Opportunistically prune expired keys to bound memory growth
    if (this.cache.size > 1000 || Math.random() < 0.02) {
      this.pruneExpiredKeys(now, key);
    }

    if (timestamps.length >= limit) {
      if (timestamps.length === 0) {
        this.cache.delete(key);
        this.keyExpiries.delete(key);
        return {
          allowed: false,
          limit,
          remaining: 0,
          retryAfterSeconds: 1,
          resetUnixSeconds: Math.ceil((now + windowMs) / 1000),
        };
      }
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + windowMs - now) / 1000)
      );
      const resetUnixSeconds = Math.ceil((oldest + windowMs) / 1000);
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds,
        resetUnixSeconds,
      };
    }

    timestamps.push(now);
    this.cache.set(key, timestamps);
    this.keyExpiries.set(key, now + windowMs);

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - timestamps.length),
      retryAfterSeconds: 0,
      resetUnixSeconds: Math.ceil((now + windowMs) / 1000),
    };
  }

  /**
   * Inspects the sliding window without recording a consumption hit.
   */
  public check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (this.cache.get(key) || []).filter((t) => t > windowStart);

    if (timestamps.length === 0) {
      this.cache.delete(key);
      this.keyExpiries.delete(key);
    }

    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((oldest + windowMs - now) / 1000)
        ),
        resetUnixSeconds: Math.ceil((oldest + windowMs) / 1000),
      };
    }

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - timestamps.length),
      retryAfterSeconds: 0,
      resetUnixSeconds: Math.ceil((now + windowMs) / 1000),
    };
  }

  /**
   * Records a failed attempt (e.g. for sign-off password lockout).
   */
  public recordFailure(key: string, windowMs: number): void {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (this.cache.get(key) || []).filter((t) => t > windowStart);
    timestamps.push(now);
    this.cache.set(key, timestamps);
    this.keyExpiries.set(key, now + windowMs);
  }

  /**
   * Clears all cached rate limit keys (for testing or maintenance).
   */
  public reset(): void {
    this.cache.clear();
    this.keyExpiries.clear();
  }

  /**
   * Clears a specific key.
   */
  public clearKey(key: string): void {
    this.cache.delete(key);
    this.keyExpiries.delete(key);
  }

  /**
   * Checks if a key exists in cache.
   */
  public hasKey(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Purges expired timestamps across all keys, deleting empty keys.
   */
  public purgeExpired(windowMs: number): void {
    const now = Date.now();
    const windowStart = now - windowMs;
    for (const [key, timestamps] of this.cache.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.cache.delete(key);
        this.keyExpiries.delete(key);
      } else {
        this.cache.set(key, active);
      }
    }
  }
}

export const rateLimiter = new MemorySlidingWindowRateLimiter();

/**
 * Extracts client IP from trusted proxy headers first (Vercel / reverse proxy)
 * before falling back to x-forwarded-for.
 */
export function extractTrustedClientIp(
  request: Request | { headers: { get(name: string): string | null } }
): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const first = vercelForwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "127.0.0.1";
}

interface RawRateLimitRow {
  count: number;
  retry_after_seconds: number;
  reset_unix_seconds: number;
}

/**
 * Atomically consumes a distributed rate limit hit in PostgreSQL (veridoc.rate_limits),
 * resetting count=1 when the window has expired and opportunistically cleaning expired rows.
 */
export async function consumeDistributedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  dbClient: DrizzleDb = db
): Promise<RateLimitResult> {
  const safeWindowMs = Math.max(1, Math.floor(windowMs));

  const rows = await dbClient.execute(sql`
    INSERT INTO "veridoc"."rate_limits" ("key", "window_start", "count", "expires_at")
    VALUES (
      ${key},
      now(),
      1,
      now() + (${safeWindowMs} * interval '1 millisecond')
    )
    ON CONFLICT ("key") DO UPDATE SET
      "window_start" = CASE
        WHEN "veridoc"."rate_limits"."expires_at" <= now() THEN now()
        ELSE "veridoc"."rate_limits"."window_start"
      END,
      "count" = CASE
        WHEN "veridoc"."rate_limits"."expires_at" <= now() THEN 1
        ELSE "veridoc"."rate_limits"."count" + 1
      END,
      "expires_at" = CASE
        WHEN "veridoc"."rate_limits"."expires_at" <= now() THEN now() + (${safeWindowMs} * interval '1 millisecond')
        ELSE "veridoc"."rate_limits"."expires_at"
      END
    RETURNING
      "count",
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expires_at" - now()))))::int AS "retry_after_seconds",
      CEIL(EXTRACT(EPOCH FROM "expires_at"))::int AS "reset_unix_seconds"
  `);

  // Opportunistic expired-row cleanup (~2% of writes deleting up to 100 expired rows)
  if (Math.random() < 0.02) {
    try {
      await dbClient.execute(sql`
        DELETE FROM "veridoc"."rate_limits"
        WHERE "key" IN (
          SELECT "key" FROM "veridoc"."rate_limits"
          WHERE "expires_at" <= now()
          LIMIT 100
        )
      `);
    } catch {
      // Non-fatal opportunistic cleanup
    }
  }

  const row = Array.from(rows as unknown as RawRateLimitRow[])[0];
  const count = Number(row?.count ?? 1);
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Number(row?.retry_after_seconds ?? 1));
  const resetUnixSeconds = Number(
    row?.reset_unix_seconds ?? Math.ceil((Date.now() + safeWindowMs) / 1000)
  );

  return {
    allowed,
    limit,
    remaining,
    retryAfterSeconds,
    resetUnixSeconds,
  };
}

/**
 * Inspects a distributed rate limit key without incrementing its counter.
 */
export async function checkDistributedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  dbClient: DrizzleDb = db
): Promise<RateLimitResult> {
  const safeWindowMs = Math.max(1, Math.floor(windowMs));

  const rows = await dbClient.execute(sql`
    SELECT
      "count",
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expires_at" - now()))))::int AS "retry_after_seconds",
      CEIL(EXTRACT(EPOCH FROM "expires_at"))::int AS "reset_unix_seconds"
    FROM "veridoc"."rate_limits"
    WHERE "key" = ${key}
      AND "expires_at" > now()
    LIMIT 1
  `);

  const row = Array.from(rows as unknown as RawRateLimitRow[])[0];
  if (!row) {
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit),
      retryAfterSeconds: 0,
      resetUnixSeconds: Math.ceil((Date.now() + safeWindowMs) / 1000),
    };
  }

  const count = Number(row.count);
  if (count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds ?? 1)),
      resetUnixSeconds: Number(row.reset_unix_seconds),
    };
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: 0,
    resetUnixSeconds: Number(row.reset_unix_seconds),
  };
}

/**
 * Clears a distributed rate limit key (e.g. after successful re-authentication).
 */
export async function clearDistributedRateLimit(
  key: string,
  dbClient: DrizzleDb = db
): Promise<void> {
  await dbClient.execute(sql`
    DELETE FROM "veridoc"."rate_limits"
    WHERE "key" = ${key}
  `);
}

export function createRateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Please try again in ${result.retryAfterSeconds} seconds.`,
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetUnixSeconds),
      },
    }
  );
}
