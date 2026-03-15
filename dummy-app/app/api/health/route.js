import { NextResponse } from "next/server";

import { logEvent } from "../../../lib/logger";

export const runtime = "nodejs";

export async function GET() {
  logEvent("info", "Health check completed", {
    route: "/api/health",
  });

  return NextResponse.json({
    status: "ok",
    service: "dummy-app",
  });
}
