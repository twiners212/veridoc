import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { ApprovalService } from "@/server/services/approval.service";
import { DomainError } from "@/types/errors";
import type { ApprovalQueueResponse } from "@/types/approvals";

const queueQuerySchema = z.object({
  scope: z.enum(["active", "upcoming"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Session resolution
    const authContext = await resolveApiRequestContext(request);
    if (!authContext) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to access approvals queue",
          },
        },
        { status: 401 }
      );
    }

    // 2. Query params parsing & validation
    const { searchParams } = new URL(request.url);
    const parsedQuery = queueQuerySchema.safeParse({
      scope: searchParams.get("scope") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters for approvals queue",
            details: parsedQuery.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { scope, page, limit, search } = parsedQuery.data;

    // 3. Database query scoped with tenant context
    const responsePayload = await withTenantContext(
      authContext.tenantId,
      async (tx, tenantId) => {
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          authContext.userId
        );

        return await ApprovalService.getApprovalsQueue(tx, {
          tenantId,
          actorUserId: authContext.userId,
          actorRole: membership.role,
          scope,
          page,
          limit,
          search,
        });
      }
    );

    const result: ApprovalQueueResponse = {
      success: true,
      data: responsePayload,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
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

    console.error("Failed to fetch approvals queue:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while fetching the approvals queue",
        },
      },
      { status: 500 }
    );
  }
}
