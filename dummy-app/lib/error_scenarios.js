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
