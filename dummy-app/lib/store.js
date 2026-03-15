const INITIAL_PRODUCTS = [
  {
    id: "sku_keyboard",
    name: "Signal Mechanical Keyboard",
    price: 139,
    inventory: 18,
    category: "Peripherals",
    description: "Hot-swappable mechanical keyboard tuned for long incident-response sessions.",
  },
  {
    id: "sku_monitor",
    name: "Observer 4K Display",
    price: 429,
    inventory: 9,
    category: "Displays",
    description: "High-contrast monitor built for dashboards, traces, and code review.",
  },
  {
    id: "sku_headset",
    name: "Pager Quiet Headset",
    price: 89,
    inventory: 26,
    category: "Audio",
    description: "Noise-isolating headset for late-night war rooms and product demos.",
  },
  {
    id: "sku_laptop_stand",
    name: "Flow Aluminum Stand",
    price: 69,
    inventory: 31,
    category: "Accessories",
    description: "Compact stand that keeps your laptop cool during long deploy sessions.",
  },
];

const PRODUCTS = INITIAL_PRODUCTS.map((product) => ({ ...product }));

const state = {
  orders: [],
  requestCount: 0,
};

function cloneProducts() {
  return PRODUCTS.map((product) => ({ ...product }));
}

export function listProducts() {
  return cloneProducts();
}

export function getProductById(productId) {
  const product = PRODUCTS.find((item) => item.id === productId);
  return product ? { ...product } : null;
}

export function getStateSnapshot() {
  return {
    products: cloneProducts(),
    orders: state.orders.slice().reverse(),
    totals: {
      requests: state.requestCount,
      orders: state.orders.length,
      revenue: state.orders.reduce((sum, order) => sum + order.total, 0),
    },
  };
}

export function resetOrders() {
  state.orders = [];

  for (const product of PRODUCTS) {
    const initialProduct = INITIAL_PRODUCTS.find((item) => item.id === product.id);
    if (initialProduct) {
      product.inventory = initialProduct.inventory;
    }
  }

  return getStateSnapshot();
}

export async function createOrder({ productId, quantity, email }) {
  state.requestCount += 1;

  const product = PRODUCTS.find((item) => item.id === productId);
  if (!product) {
    return { ok: false, status: 404, code: "PRODUCT_NOT_FOUND", details: { productId } };
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, status: 400, code: "INVALID_QUANTITY", details: { quantity } };
  }

  if (!email || !email.includes("@")) {
    return { ok: false, status: 400, code: "INVALID_EMAIL", details: { email } };
  }

  if (product.inventory < quantity) {
    return { ok: false, status: 409, code: "OUT_OF_STOCK", details: { available: product.inventory } };
  }

  product.inventory -= quantity;

  const order = {
    id: `ord_${String(state.orders.length + 1).padStart(4, "0")}`,
    productId,
    productName: product.name,
    quantity,
    email,
    total: quantity * product.price,
    createdAt: new Date().toISOString(),
  };

  state.orders.push(order);

  return {
    ok: true,
    status: 201,
    order,
    details: {},
  };
}
