import { NextResponse } from "next/server";

import { logEventAndFlush } from "../../../../lib/logger";

export const runtime = "nodejs";

export async function POST(request) {
  let payload = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const pathname = typeof payload.pathname === "string" ? payload.pathname : "/";
  const referrer = typeof payload.referrer === "string" ? payload.referrer : "";
  const viewport =
    payload.viewport &&
    typeof payload.viewport.width === "number" &&
    typeof payload.viewport.height === "number"
      ? {
          width: payload.viewport.width,
          height: payload.viewport.height,
        }
      : undefined;

  const { pipeline } = await logEventAndFlush(
    "info",
    "User arrived at storefront",
    {
      route: "/api/session/arrive",
      trigger: "page-load",
      pathname,
      referrer: referrer || "direct",
      viewport,
    },
    {},
    { timeoutMs: 8000 },
  );

  return NextResponse.json({
    ok: true,
    pipelineOk: pipeline.ok,
    pipelineStatus: pipeline.status ?? null,
  });
}
