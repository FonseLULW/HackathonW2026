import { NextResponse } from "next/server";

import { activateChaos } from "../../../../lib/store";
import { logEvent } from "../../../../lib/logger";

export const runtime = "nodejs";

export async function POST(_request, context) {
  const params = await context.params;
  const mode = params.mode;
  const chaos = activateChaos(mode);

  if (!chaos) {
    logEvent("warn", `Unknown chaos mode requested: ${mode}`, {
      route: `/api/chaos/${mode}`,
      mode,
    });
    return NextResponse.json({ error: "Unknown chaos mode" }, { status: 404 });
  }

  const level = mode === "reset" ? "info" : "warn";
  logEvent(level, `Chaos mode updated: ${mode}`, {
    route: `/api/chaos/${mode}`,
    mode,
    activeModes: chaos.activeModes,
    poolUsage: chaos.poolUsage,
    memoryPressure: chaos.memoryPressure,
  });

  return NextResponse.json({
    mode,
    chaos,
  });
}
