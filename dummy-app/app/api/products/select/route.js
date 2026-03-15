import { NextResponse } from "next/server";

import { triggerSilentProductSelectionError } from "../../../../lib/error_scenarios";
import { logEvent } from "../../../../lib/logger";
import { getProductById } from "../../../../lib/store";

export const runtime = "nodejs";

const SILENT_ERROR_PRODUCT_ID = "sku_keyboard";

export async function POST(request) {
  let payload = {};

  try {
    payload = await request.json();
  } catch {
    logEvent("error", "Product selection payload was invalid JSON", {
      route: "/api/products/select",
    });
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const product = getProductById(payload.productId);
  if (!product) {
    logEvent("warn", "Product selection failed: PRODUCT_NOT_FOUND", {
      route: "/api/products/select",
      productId: payload.productId,
    });
    return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
  }

  if (product.id === SILENT_ERROR_PRODUCT_ID) {
    try {
      triggerSilentProductSelectionError(product);
    } catch (error) {
      logEvent(
        "error",
        "Silent product selection error captured",
        {
          route: "/api/products/select",
          productId: product.id,
          productName: product.name,
          scenario: "signal-keyboard-selection",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        {
          raw: error instanceof Error ? error.stack : String(error),
        },
      );
    }
  } else {
    logEvent("info", "Product selected", {
      route: "/api/products/select",
      productId: product.id,
      productName: product.name,
    });
  }

  return NextResponse.json({
    ok: true,
    product: {
      id: product.id,
      name: product.name,
    },
  });
}
