export function resolveWebSocketUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (
        (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
        (url.protocol === "wss:" || url.protocol === "https:")
      ) {
        return `ws://${url.hostname}:3001/ws`;
      }
      return explicit;
    } catch {
      return explicit;
    }
  }

  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `ws://${hostname}:3001/ws`;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  return "ws://localhost:3001/ws";
}
