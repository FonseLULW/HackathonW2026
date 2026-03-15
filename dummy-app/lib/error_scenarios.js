export function triggerSilentProductSelectionError(product) {
  return hydrateInventoryReservation(product);
}

function hydrateInventoryReservation(product) {
  return attachSelectionSnapshot(product);
}

function attachSelectionSnapshot(product) {
  const inventorySnapshot = null;

  // Intentional bug for demo purposes: simulates a missing inventory lookup result.
  return {
    productId: product.id,
    reservationIds: inventorySnapshot.reservations.map((reservation) => reservation.id),
  };
}

// --- Subtle anomalies for other products (probabilistic) ---

/**
 * Simulates a slow inventory database lookup.
 * Returns { triggered, latencyMs } — caller decides whether to log.
 */
export function maybeSlowInventoryLookup(product) {
  if (Math.random() > 0.12) return { triggered: false };

  const latencyMs = 1800 + Math.floor(Math.random() * 2200); // 1800–4000ms
  return {
    triggered: true,
    latencyMs,
    productId: product.id,
    productName: product.name,
  };
}

/**
 * Simulates a heap usage spike during product hydration.
 * Returns { triggered, heapUsed, heapTotal, percentage }.
 */
export function maybeHeapPressure(product) {
  if (Math.random() > 0.07) return { triggered: false };

  const heapTotal = 200 + Math.floor(Math.random() * 56); // 200–256 MB
  const percentage = 82 + Math.random() * 14; // 82–96%
  const heapUsed = Math.floor(heapTotal * (percentage / 100));
  return {
    triggered: true,
    heapUsed,
    heapTotal,
    percentage: Math.round(percentage * 10) / 10,
    productId: product.id,
    productName: product.name,
  };
}

/**
 * Simulates a cache/actual inventory mismatch.
 * Returns { triggered, cached, actual }.
 */
export function maybeCacheInconsistency(product) {
  if (Math.random() > 0.10) return { triggered: false };

  const drift = Math.floor(Math.random() * 5) + 1; // 1–5 unit drift
  const direction = Math.random() > 0.5 ? 1 : -1;
  return {
    triggered: true,
    cached: product.inventory,
    actual: product.inventory + direction * drift,
    productId: product.id,
    productName: product.name,
  };
}
