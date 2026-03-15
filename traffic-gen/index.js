const TARGET = process.env.TARGET_URL || "http://dummy-app:3000";
const CHAOS_MODE = process.env.CHAOS_MODE || "db-leak";
const SAFE_PRODUCT_IDS = ["sku_monitor", "sku_headset", "sku_laptop_stand"];

async function hit(path, options = {}) {
  try {
    const res = await fetch(`${TARGET}${path}`, options);
    const text = await res.text();
    console.log(`${res.status} ${path} ${text.slice(0, 140)}`);
  } catch (e) {
    console.error(`Failed ${path}: ${e.message}`);
  }
}

async function createOrder() {
  const productId = SAFE_PRODUCT_IDS[Math.floor(Math.random() * SAFE_PRODUCT_IDS.length)];
  const quantity = 1 + Math.floor(Math.random() * 2);

  await hit("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productId,
      quantity,
      email: `traffic-${Date.now()}@snooplog.dev`,
    }),
  });
}

async function selectSafeProduct() {
  const productId = SAFE_PRODUCT_IDS[Math.floor(Math.random() * SAFE_PRODUCT_IDS.length)];

  await hit("/api/products/select", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productId,
    }),
  });
}

async function loop() {
  let iteration = 0;
  while (true) {
    iteration += 1;

    if (iteration === 3) {
      await hit(`/api/chaos/${CHAOS_MODE}`, { method: "POST" });
    }

    if (iteration % 6 === 0) {
      await selectSafeProduct();
    } else if (iteration % 4 === 0) {
      await hit("/api/products");
    } else if (iteration % 5 === 0) {
      await hit("/api/health");
    } else {
      await createOrder();
    }

    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1500));
  }
}

console.log(`Traffic generator targeting ${TARGET}`);
loop();
