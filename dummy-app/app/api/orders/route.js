import { NextResponse } from "next/server";

import { createOrder, getStateSnapshot } from "../../../lib/store";
import { logEvent } from "../../../lib/logger";

export const runtime = "nodejs";

export async function POST(request) {
  let payload = {};

  try {
    payload = await request.json();
  } catch {
    logEvent("error", "Order payload was invalid JSON", {
      route: "/api/orders",
    });
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const quantity = Number.parseInt(String(payload.quantity ?? "1"), 10);
  const result = await createOrder({
    productId: payload.productId,
    quantity,
    email: payload.email,
  });

  const snapshot = getStateSnapshot();
  const commonMetadata = {
    route: "/api/orders",
    productId: payload.productId,
    quantity,
    email: payload.email,
  };

  if (!result.ok) {
    const level = result.status >= 500 ? "fatal" : result.status >= 400 ? "warn" : "info";
    logEvent(level, `Order failed: ${result.code}`, {
      ...commonMetadata,
      details: result.details,
    });

    return NextResponse.json(
      {
        error: result.code,
        details: result.details ?? {},
      },
      { status: result.status },
    );
  }

  logEvent("info", "Order created", {
    ...commonMetadata,
    orderId: result.order.id,
    total: result.order.total,
  });

  return NextResponse.json(
    {
      order: result.order,
    },
    { status: result.status },
  );
}
