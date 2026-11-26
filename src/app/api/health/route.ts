import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const isDeep = request.nextUrl.searchParams.get("deep") === "true";

  if (!isDeep) {
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      {
        status: "ok",
        db: "connected",
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        db: "unavailable",
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
