/**
 * Stub traffic generator — Person 4 will expand.
 * Sends periodic requests to the dummy app.
 */

const TARGET = process.env.TARGET_URL || "http://dummy-app:3000";

async function hit(path) {
  try {
    const res = await fetch(`${TARGET}${path}`);
    console.log(`${res.status} ${path}`);
  } catch (e) {
    console.error(`Failed ${path}: ${e.message}`);
  }
}

async function loop() {
  const endpoints = ["/api/health", "/api/products"];
  while (true) {
    const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
    await hit(ep);
    // Random interval 1-5 seconds
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 4000));
  }
}

console.log(`Traffic generator targeting ${TARGET}`);
loop();
