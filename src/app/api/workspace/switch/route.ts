import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withTenantContext } from "@/db/context";
import { sessions } from "@/db/schema";
import { auth, getDefaultLandingRouteForRole } from "@/lib/auth/server";
import { getActiveMembership } from "@/server/policies/membership.policy";
import { DomainError } from "@/types/errors";

const switchWorkspaceSchema = z.object({
  tenantId: z.string().uuid(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id || !session?.session?.id) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to switch workspace",
          },
        },
        { status: 401 }
      );
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

    const parsed = switchWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid workspace tenantId",
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const result = await withTenantContext(
      parsed.data.tenantId,
      async (tx, tenantId) => {
        const membership = await getActiveMembership(
          tx,
          tenantId,
          session.user.id
        );
        if (!membership) {
          throw new DomainError("NOT_FOUND", "Workspace not found", 404);
        }

        await tx
          .update(sessions)
          .set({
            activeTenantId: tenantId,
            updatedAt: new Date(),
          })
          .where(eq(sessions.id, session.session.id));

        return {
          activeTenantId: tenantId,
          role: membership.role,
          redirectTo: getDefaultLandingRouteForRole(membership.role),
        };
      }
    );

    const response = NextResponse.json({ data: result }, { status: 200 });
    response.cookies.delete("better-auth.session_data");
    response.cookies.delete("__Secure-better-auth.session_data");
    return response;
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            fieldErrors: error.fieldErrors,
          },
        },
        { status: error.httpStatus }
      );
    }

    console.error("Failed to switch workspace:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while switching workspace",
        },
      },
      { status: 500 }
    );
  }
}
