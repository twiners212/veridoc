import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { assertCanViewCompletionDashboard } from "@/server/policies/rbac.policy";
import { ReaderService } from "@/server/services/reader.service";
import { DomainError } from "@/types/errors";

const querySchema = z.object({
  documentId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  overdueOnly: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authContext = await resolveApiRequestContext(request);
    if (!authContext) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to access completion dashboard",
          },
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      documentId: searchParams.get("documentId") ?? undefined,
      groupId: searchParams.get("groupId") ?? undefined,
      overdueOnly: searchParams.get("overdueOnly") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters for completion dashboard",
            details: parsedQuery.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { documentId, groupId, overdueOnly, page, limit } = parsedQuery.data;

    const dashboardData = await withTenantContext(
      authContext.tenantId,
      async (tx, tenantId) => {
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          authContext.userId
        );
        assertCanViewCompletionDashboard(membership);

        return await ReaderService.getGovernanceDashboardData(tx, {
          tenantId,
          documentId,
          groupId,
          overdueOnly,
          page,
          limit,
        });
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: dashboardData,
      },
      { status: 200 }
    );
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

    console.error("Failed to fetch completion dashboard:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while fetching the completion dashboard",
        },
      },
      { status: 500 }
    );
  }
}
