import { NextResponse } from "next/server";

import { listProducts, getStateSnapshot } from "../../../lib/store";
import { logEvent } from "../../../lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const products = listProducts();
  const snapshot = getStateSnapshot();

  logEvent("info", "Products listed", {
    route: "/api/products",
    count: products.length,
    activeModes: snapshot.chaos.activeModes,
  });

  return NextResponse.json({
    products,
    chaos: snapshot.chaos,
  });
}
