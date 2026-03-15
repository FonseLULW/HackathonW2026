import { NextResponse } from "next/server";

import { listProducts } from "../../../lib/store";
import { logEvent } from "../../../lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const products = listProducts();

  logEvent("info", "Products listed", {
    route: "/api/products",
    count: products.length,
  });

  return NextResponse.json({
    products,
  });
}
