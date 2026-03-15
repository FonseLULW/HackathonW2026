"use client";

import { useEffect, useState, useTransition } from "react";

export default function Storefront({ initialSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [message, setMessage] = useState({
    tone: "neutral",
    title: "Storefront is live",
    body: "Orders, traffic, and product selection are ready for local demo testing.",
  });
  const [orderForm, setOrderForm] = useState({
    productId: initialSnapshot.products[0]?.id ?? "",
    quantity: "1",
    email: "demo@snooplog.dev",
  });
  const [selectedProductId, setSelectedProductId] = useState(initialSnapshot.products[0]?.id ?? "");
  const [orderPanelFlash, setOrderPanelFlash] = useState("idle");
  const [activityPulse, setActivityPulse] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (orderPanelFlash === "idle") {
      return undefined;
    }

    const timer = window.setTimeout(() => setOrderPanelFlash("idle"), 1200);
    return () => window.clearTimeout(timer);
  }, [orderPanelFlash]);

  useEffect(() => {
    if (!activityPulse) {
      return undefined;
    }

    const timer = window.setTimeout(() => setActivityPulse(false), 1100);
    return () => window.clearTimeout(timer);
  }, [activityPulse]);

  async function handleOrderSubmit(event) {
    event.preventDefault();

    startTransition(() => {
      void submitOrder();
    });
  }

  async function submitOrder() {
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: orderForm.productId,
          quantity: Number.parseInt(orderForm.quantity || "1", 10),
          email: orderForm.email,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage({
          tone: "error",
          title: "Order could not be placed",
          body: payload.error ? `${payload.error}: ${formatDetails(payload.details)}` : "Unexpected API error",
        });
        return;
      }

      setSnapshot((current) => {
        const nextProducts = current.products.map((product) =>
          product.id === payload.order.productId
            ? { ...product, inventory: Math.max(0, product.inventory - payload.order.quantity) }
            : product,
        );

        return {
          ...current,
          products: nextProducts,
          orders: [payload.order, ...current.orders],
          totals: {
            requests: current.totals.requests + 1,
            orders: current.totals.orders + 1,
            revenue: current.totals.revenue + payload.order.total,
          },
        };
      });
      setMessage({
        tone: "success",
        title: "Order created",
        body: `Order ${payload.order.id} placed for ${payload.order.productName}.`,
      });
      setOrderPanelFlash("success");
      setActivityPulse(true);
    } catch (error) {
      setMessage({
        tone: "error",
        title: "Order request failed",
        body: error instanceof Error ? error.message : "The request did not complete.",
      });
      setOrderPanelFlash("error");
    }
  }

  function handleSelectProduct(product) {
    startTransition(() => {
      void selectProduct(product);
    });
  }

  function handleResetOrders() {
    startTransition(() => {
      void resetOrders();
    });
  }

  async function selectProduct(product) {
    setOrderForm((current) => ({
      ...current,
      productId: product.id,
    }));
    setSelectedProductId(product.id);
    setOrderPanelFlash("highlight");

    try {
      await fetch("/api/products/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.id,
        }),
      });
    } catch {
      // Keep the selection flow quiet in the UI; the backend logs what we need for pipeline testing.
    }
  }

  async function resetOrders() {
    try {
      const response = await fetch("/api/orders/reset", { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        setMessage({
          tone: "error",
          title: "Order reset failed",
          body: payload.error ?? "The storefront state could not be reset.",
        });
        return;
      }

      setSnapshot(payload.snapshot);
      setMessage({
        tone: "success",
        title: "Orders reset",
        body: "Order history and product inventory are back to the starting state.",
      });
      setOrderPanelFlash("highlight");
      setActivityPulse(true);
    } catch (error) {
      setMessage({
        tone: "error",
        title: "Order reset request failed",
        body: error instanceof Error ? error.message : "The request did not complete.",
      });
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/90 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.3fr_0.9fr] lg:px-10 lg:py-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-700">
                  SnoopCart Atelier
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Live demo storefront
                </span>
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-5xl leading-[0.95] text-slate-950 sm:text-6xl">
                  Premium desk setups for teams that live in the flow.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  A polished customer-facing storefront backed by realistic operational behavior:
                  orders, inventory shifts, service health, and on-demand failure modes that feed
                  the rest of the SnoopLog demo.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard label="Revenue" value={`$${snapshot.totals.revenue}`} />
                <MetricCard label="Orders" value={`${snapshot.totals.orders}`} />
                <MetricCard label="Requests" value={`${snapshot.totals.requests}`} />
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-brand-100 bg-brand-50 p-6 shadow-inner shadow-brand-100/60">
              <div className="space-y-4">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-brand-700">
                  Experience promise
                </p>
                <div className="space-y-3 text-sm leading-6 text-slate-700">
                  <p>White-glove accessories, fast fulfillment, and clean service telemetry.</p>
                  <p>
                    Structured JSON logs are written for every API action, making this storefront a
                    believable source app instead of a toy stub.
                  </p>
                </div>
                <div className="grid gap-3 pt-3 text-sm text-slate-700">
                  <BadgeRow label="Traffic mode" value="Customer reads + order writes" />
                  <BadgeRow label="Logging" value="Structured JSON to stdout" />
                  <BadgeRow label="Selection caveat" value="Signal keyboard logs a caught error" />
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-8">
            <section className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.4)]">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-700">
                    Featured Collection
                  </p>
                  <h2 className="mt-2 text-3xl text-slate-950">Customer-ready product catalog</h2>
                </div>
                <a
                  className="text-sm font-semibold text-slate-600 underline decoration-brand-300 underline-offset-4"
                  href="/api/products"
                >
                  View raw products JSON
                </a>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                {snapshot.products.map((product) => (
                  <article
                    className={`group overflow-hidden rounded-[1.5rem] border bg-gradient-to-br from-white to-slate-50 p-5 transition duration-300 hover:-translate-y-1 hover:shadow-xl ${
                      selectedProductId === product.id
                        ? "border-brand-300 shadow-[0_18px_45px_-30px_rgba(147,107,56,0.85)] ring-1 ring-brand-200"
                        : "border-slate-200"
                    }`}
                    key={product.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
                          {product.category}
                        </p>
                        <h3 className="mt-3 text-2xl text-slate-950">{product.name}</h3>
                      </div>
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                        {product.inventory} left
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">{product.description}</p>
                    <div className="mt-6 flex items-end justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Price</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">${product.price}</p>
                      </div>
                      <button
                        className={`motion-button rounded-full border px-4 py-2 text-sm font-semibold transition duration-200 ${
                          selectedProductId === product.id
                            ? "border-brand-500 bg-brand-500 text-white shadow-[0_10px_30px_-18px_rgba(124,86,45,0.9)] hover:bg-brand-600"
                            : "border-slate-300 text-slate-700 hover:border-slate-900 hover:text-slate-950"
                        }`}
                        onClick={() => handleSelectProduct(product)}
                        type="button"
                      >
                        Select item
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section
              className={`rounded-[2rem] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-[0_24px_70px_-45px_rgba(15,23,42,0.75)] ${
                activityPulse ? "panel-pulse" : ""
              }`}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-200">
                    Recent activity
                  </p>
                  <h2 className="mt-2 text-3xl">Orders flowing through the storefront</h2>
                </div>
                <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-200">
                  {snapshot.orders.length} orders recorded in memory
                </span>
              </div>
              <div className="mt-6 grid gap-3">
                {snapshot.orders.length === 0 ? (
                  <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-8 text-center text-slate-300">
                    No orders yet. Submit one from the purchase panel to test the happy path.
                  </div>
                ) : (
                  snapshot.orders.slice(0, 6).map((order) => (
                    <div
                      className="flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-white/5 px-5 py-4 md:flex-row md:items-center md:justify-between"
                      key={order.id}
                    >
                      <div>
                        <p className="text-lg font-semibold text-white">{order.productName}</p>
                        <p className="text-sm text-slate-300">
                          {order.email} · qty {order.quantity}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-lg font-semibold text-white">${order.total}</p>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          {order.id}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-8">
            <section
              className={`rounded-[2rem] border bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.5)] transition-all duration-300 ${
                orderPanelFlash === "success"
                  ? "border-emerald-300 ring-4 ring-emerald-100 panel-glow-success"
                  : orderPanelFlash === "error"
                    ? "border-rose-300 ring-4 ring-rose-100 panel-glow-error"
                    : orderPanelFlash === "highlight"
                      ? "border-brand-300 ring-4 ring-brand-100 panel-glow-brand"
                      : "border-slate-200/80"
              }`}
            >
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">
                  Purchase panel
                </p>
                <h2 className="text-3xl text-slate-950">Place a demo order</h2>
                <p className="text-sm leading-6 text-slate-600">
                  This uses direct client-side API calls so local testing stays stable and the UI
                  can show API responses cleanly.
                </p>
              </div>
              <form className="mt-6 space-y-4" onSubmit={handleOrderSubmit}>
                <Field label="Product">
                  <select
                    className={inputClasses}
                    name="productId"
                    onChange={(event) => {
                      setOrderForm((current) => ({ ...current, productId: event.target.value }));
                      setSelectedProductId(event.target.value);
                      setOrderPanelFlash("highlight");
                    }}
                    value={orderForm.productId}
                  >
                    {snapshot.products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Quantity">
                    <input
                      className={inputClasses}
                      min="1"
                      name="quantity"
                      onChange={(event) =>
                        setOrderForm((current) => ({ ...current, quantity: event.target.value }))
                      }
                      type="number"
                      value={orderForm.quantity}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className={inputClasses}
                      name="email"
                      onChange={(event) =>
                        setOrderForm((current) => ({ ...current, email: event.target.value }))
                      }
                      type="email"
                      value={orderForm.email}
                    />
                  </Field>
                </div>
                <button
                  className={`motion-button w-full rounded-full px-5 py-3 text-sm font-semibold text-white transition duration-300 disabled:cursor-not-allowed disabled:bg-slate-400 ${
                    isPending
                      ? "bg-slate-500"
                      : orderPanelFlash === "success"
                        ? "bg-emerald-600 shadow-[0_0_0_1px_rgba(16,185,129,0.15),0_0_32px_rgba(16,185,129,0.25)] hover:bg-emerald-500"
                        : "bg-slate-950 hover:bg-slate-800"
                  }`}
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? "Submitting order..." : "Create order"}
                </button>
              </form>
            </section>

            <section className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.5)]">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">
                  Demo controls
                </p>
                <h2 className="text-3xl text-slate-950">Store controls</h2>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  onClick={handleResetOrders}
                  type="button"
                >
                  Reset orders
                </button>
              </div>
            </section>

            {/* <section
              className={`rounded-[2rem] border p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.5)] ${messageTone[message.tone]}`}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.24em]">Store status</p>
              <h2 className="mt-2 text-2xl">{message.title}</h2>
              <p className="mt-3 text-sm leading-6">{message.body}</p>
            </section> */}

            <section className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.5)]">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">
                Quick links
              </p>
              <div className="mt-4 grid gap-3">
                <QuickLink href="/api/health" label="Health JSON" />
                <QuickLink href="/api/products" label="Products JSON" />
                <QuickLink href="/api/products/select" label="Product select API" method="POST" />
                <QuickLink href="/api/orders/reset" label="Order reset API" method="POST" />
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/90 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function BadgeRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-brand-100 bg-white/70 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ label, value }) {
  return (
    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <span className="font-medium text-slate-500">{label}:</span> {value}
    </div>
  );
}

function QuickLink({ href, label, method }) {
  return (
    <a
      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
      href={href}
    >
      <span>{label}</span>
      <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{method ?? "GET"}</span>
    </a>
  );
}

function formatDetails(details) {
  if (!details || typeof details !== "object") {
    return "No extra details";
  }

  return Object.entries(details)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

const inputClasses =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100";

const messageTone = {
  neutral: "border-slate-200 bg-white/90 text-slate-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
};
