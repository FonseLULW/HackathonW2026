import { NextResponse } from "next/server";

import { getStateSnapshot } from "../../../lib/store";
import { logEvent } from "../../../lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = getStateSnapshot();
  logEvent("info", "Health check completed", {
    route: "/api/health",
    activeModes: snapshot.chaos.activeModes,
  });

  return NextResponse.json({
    status: "ok",
    service: "dummy-app",
    chaos: snapshot.chaos,
  });
}
