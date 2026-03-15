const BASE_POOL_USAGE = 30;

const PRODUCTS = [
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

const state = {
  chaos: {
    mode: "reset",
    poolUsage: BASE_POOL_USAGE,
    memoryPressure: 0,
    activeModes: [],
  },
  orders: [],
  retainedMemory: [],
  requestCount: 0,
};

function cloneProducts() {
  return PRODUCTS.map((product) => ({ ...product }));
}

function addMode(mode) {
  if (!state.chaos.activeModes.includes(mode)) {
    state.chaos.activeModes.push(mode);
  }
  state.chaos.mode = mode;
}

function removeAllModes() {
  state.chaos.activeModes = [];
  state.chaos.mode = "reset";
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
    chaos: {
      mode: state.chaos.mode,
      activeModes: [...state.chaos.activeModes],
      poolUsage: state.chaos.poolUsage,
      memoryPressure: state.chaos.memoryPressure,
    },
    totals: {
      requests: state.requestCount,
      orders: state.orders.length,
      revenue: state.orders.reduce((sum, order) => sum + order.total, 0),
    },
  };
}

export function activateChaos(mode) {
  switch (mode) {
    case "db-leak":
    case "slow-query":
    case "auth-fail":
    case "memory":
      addMode(mode);
      return {
        mode,
        activeModes: [...state.chaos.activeModes],
        poolUsage: state.chaos.poolUsage,
        memoryPressure: state.chaos.memoryPressure,
      };
    case "reset":
      removeAllModes();
      state.chaos.poolUsage = BASE_POOL_USAGE;
      state.chaos.memoryPressure = 0;
      state.retainedMemory = [];
      return {
        mode: "reset",
        activeModes: [],
        poolUsage: state.chaos.poolUsage,
        memoryPressure: state.chaos.memoryPressure,
      };
    default:
      return null;
  }
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

  if (state.chaos.activeModes.includes("auth-fail")) {
    return { ok: false, status: 401, code: "AUTH_PROVIDER_DOWN", details: { email } };
  }

  if (state.chaos.activeModes.includes("slow-query")) {
    await delay(1200);
  }

  if (state.chaos.activeModes.includes("memory")) {
    const chunk = `${email}:${productId}`.repeat(4000);
    state.retainedMemory.push(chunk);
    state.chaos.memoryPressure = Math.min(100, state.chaos.memoryPressure + 12);
  }

  if (state.chaos.activeModes.includes("db-leak")) {
    state.chaos.poolUsage = Math.min(100, state.chaos.poolUsage + 5);
    if (state.chaos.poolUsage >= 95) {
      return {
        ok: false,
        status: 503,
        code: "DB_POOL_EXHAUSTED",
        details: { poolUsage: state.chaos.poolUsage },
      };
    }
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
    details: {
      poolUsage: state.chaos.poolUsage,
      memoryPressure: state.chaos.memoryPressure,
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
