import { NextResponse } from "next/server";

import { logEvent } from "../../../../lib/logger";
import { resetOrders } from "../../../../lib/store";

export const runtime = "nodejs";

export async function POST() {
  const snapshot = resetOrders();

  logEvent("info", "Orders reset from demo controls", {
    route: "/api/orders/reset",
    orderCount: snapshot.orders.length,
  });

  return NextResponse.json({
    ok: true,
    snapshot,
  });
}
