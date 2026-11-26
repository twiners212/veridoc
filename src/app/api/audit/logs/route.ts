import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiRequestContext } from "@/lib/auth/server";
import { withTenantContext } from "@/db/context";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { assertCanViewAuditLogs } from "@/server/policies/rbac.policy";
import {
  getAuditLogs,
  getAuditStats,
  type GetAuditLogsParams,
} from "@/server/services/audit.service";
import { DomainError } from "@/types/errors";

const querySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  cursorSequence: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(100).optional(),
  eventType: z.string().trim().optional(),
  role: z.string().trim().optional(),
  actorRole: z.string().trim().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authContext = await resolveApiRequestContext(request);
    if (!authContext) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to access audit logs",
          },
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      cursor: searchParams.get("cursor") ?? undefined,
      cursorSequence: searchParams.get("cursorSequence") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      eventType: searchParams.get("eventType") ?? undefined,
      role: searchParams.get("role") ?? undefined,
      actorRole: searchParams.get("actorRole") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters for audit logs",
            details: parsedQuery.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const {
      cursor,
      cursorSequence,
      limit,
      search,
      eventType,
      role,
      actorRole,
      startDate,
      endDate,
    } = parsedQuery.data;

    const data = await withTenantContext(
      authContext.tenantId,
      async (tx, tenantId) => {
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          authContext.userId
        );
        assertCanViewAuditLogs(membership);

        const queryParams: GetAuditLogsParams = {
          tenantId,
          cursor: cursor ?? cursorSequence ?? null,
          limit,
          search: search || null,
          eventType: eventType || null,
          actorRole: actorRole ?? role ?? null,
          startDate: startDate || null,
          endDate: endDate || null,
        };

        const [logsResult, statsResult] = await Promise.all([
          getAuditLogs(tx, queryParams),
          getAuditStats(tx, tenantId),
        ]);

        return {
          items: logsResult.items,
          nextCursorSequence: logsResult.nextCursorSequence,
          hasMore: logsResult.hasMore,
          limit: logsResult.limit,
          stats: statsResult,
        };
      }
    );

    return NextResponse.json(
      {
        success: true,
        data,
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

    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while fetching audit logs",
        },
      },
      { status: 500 }
    );
  }
}
