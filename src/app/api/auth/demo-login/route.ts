import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  DEMO_PASSWORD,
  DEMO_TENANT,
  getDemoAccountByRole,
  isDemoLoginEnabled,
} from "@/lib/auth/demo-accounts";
import { auth } from "@/lib/auth/server";
import { createCorrelationId, logError } from "@/lib/logger";
import {
  consumeDistributedRateLimit,
  createRateLimitResponse,
  extractTrustedClientIp,
} from "@/server/security/rate-limiter";

const demoLoginSchema = z.object({
  role: z.enum([
    "WORKSPACE_ADMIN",
    "QUALITY_MANAGER",
    "DOCUMENT_AUTHOR",
    "APPROVER_REVIEWER",
    "READER",
  ]),
});

function buildSignInHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const forwardKeys = ["user-agent", "x-forwarded-for", "x-real-ip", "origin", "referer"];
  for (const key of forwardKeys) {
    const val = request.headers.get(key);
    if (val) {
      headers.set(key, val);
    }
  }
  return headers;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isDemoLoginEnabled()) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Demo login is disabled in this environment",
        },
      },
      { status: 403 }
    );
  }

  const clientIp = extractTrustedClientIp(request);
  const rateLimitResult = await consumeDistributedRateLimit(
    `demo-login:${clientIp}`,
    20,
    900_000
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON request body",
        },
      },
      { status: 400 }
    );
  }

  const parsed = demoLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid demo role selection",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  const demoAccount = getDemoAccountByRole(parsed.data.role);

  try {
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, demoAccount.email))
      .limit(1);

    if (!existingUser) {
      return NextResponse.json(
        {
          error: {
            code: "DEMO_NOT_SEEDED",
            message:
              "Demo accounts are not seeded in the database yet. Run `pnpm db:seed` first.",
          },
        },
        { status: 409 }
      );
    }

    const signInResponse = await auth.api.signInEmail({
      body: {
        email: demoAccount.email,
        password: DEMO_PASSWORD,
      },
      headers: buildSignInHeaders(request),
      asResponse: true,
    });

    if (!signInResponse.ok) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message:
              "Demo sign-in failed. Re-run `pnpm db:seed` if demo credentials are out of sync.",
          },
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      {
        data: {
          redirectTo: demoAccount.landingRoute,
          role: demoAccount.role,
          tenantId: DEMO_TENANT.id,
        },
      },
      { status: 200 }
    );

    const setCookies =
      typeof signInResponse.headers.getSetCookie === "function"
        ? signInResponse.headers.getSetCookie()
        : [];

    if (setCookies.length > 0) {
      for (const cookie of setCookies) {
        response.headers.append("Set-Cookie", cookie);
      }
    } else {
      const singleCookie = signInResponse.headers.get("set-cookie");
      if (singleCookie) {
        response.headers.append("Set-Cookie", singleCookie);
      }
    }

    return response;
  } catch (error) {
    const correlationId = createCorrelationId();
    logError("POST /api/auth/demo-login failed", error, { correlationId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: `An unexpected error occurred during demo login (ref: ${correlationId})`,
        },
      },
      { status: 500 }
    );
  }
}
