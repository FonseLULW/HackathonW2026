import { NextResponse } from "next/server";

import {
  triggerSilentProductSelectionError,
  maybeSlowInventoryLookup,
  maybeHeapPressure,
  maybeCacheInconsistency,
} from "../../../../lib/error_scenarios";
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : String(error);
      logEvent(
        "error",
        `Uncaught exception in product selection handler: ${errorMsg}`,
        {
          route: "/api/products/select",
          productId: product.id,
          productName: product.name,
        },
        { raw: errorStack },
      );
    }
  } else {
    logEvent("info", "Product selected", {
      route: "/api/products/select",
      productId: product.id,
      productName: product.name,
    });
  }

  // --- Subtle anomalies (probabilistic, any product) ---

  if (product.id === "sku_monitor") {
    const slow = maybeSlowInventoryLookup(product);
    if (slow.triggered) {
      logEvent("warn", `Inventory lookup for ${product.id} exceeded latency threshold (${slow.latencyMs}ms)`, {
        route: "/api/products/select",
        productId: product.id,
        productName: product.name,
        latencyMs: slow.latencyMs,
        threshold: 1500,
      });
    }
  }

  if (product.id === "sku_headset") {
    const heap = maybeHeapPressure(product);
    if (heap.triggered) {
      logEvent("warn", `Heap usage spike detected during product hydration (heapUsed: ${heap.heapUsed}MB / heapTotal: ${heap.heapTotal}MB, ${heap.percentage}%)`, {
        route: "/api/products/select",
        productId: product.id,
        productName: product.name,
        heapUsed: heap.heapUsed,
        heapTotal: heap.heapTotal,
        percentage: heap.percentage,
      });
    }
  }

  if (product.id === "sku_laptop_stand") {
    const cache = maybeCacheInconsistency(product);
    if (cache.triggered) {
      logEvent("warn", `Inventory cache inconsistency: cached=${cache.cached}, actual=${cache.actual} for ${product.id}`, {
        route: "/api/products/select",
        productId: product.id,
        productName: product.name,
        cachedInventory: cache.cached,
        actualInventory: cache.actual,
        drift: Math.abs(cache.cached - cache.actual),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    product: {
      id: product.id,
      name: product.name,
    },
  });
}
