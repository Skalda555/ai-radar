import { getConfig } from "../config";

export type GuardResult = { ok: true } | { ok: false; status: number; message: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/**
 * Host header values arrive with a port, brackets around IPv6, and sometimes a
 * user pasted a whole URL into the allowlist. Compare only the hostname.
 */
function normalizeHostname(value: string): string {
  let host = value.trim().toLowerCase();
  if (!host) return "";
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\/.*$/, "");
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 0 ? host.slice(1, end) : host.replace(/^\[|\]$/g, "");
  }
  // "host:port" only when the tail is numeric, so a bare IPv6 address survives.
  const withPort = /^([^:]+):(\d+)$/.exec(host);
  return withPort ? withPort[1] : host;
}

/**
 * Mutating endpoints are local-only unless an access token is configured.
 * This keeps a personal tool from becoming an unauthenticated public API when
 * someone later exposes it by accident.
 *
 * Browsers cannot send `x-ai-radar-token` on their own, so a LAN or tunnel host
 * that the owner trusts can be listed in `AI_RADAR_ALLOWED_HOSTS` instead.
 * That list is compared against the Host header, which a hostile website cannot
 * forge for a request aimed at this server.
 */
export function guardMutation(request: Request): GuardResult {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return { ok: true };

  const { accessToken, allowedHosts } = getConfig();
  if (accessToken) {
    const provided = request.headers.get("x-ai-radar-token") ?? "";
    if (!timingSafeEqual(provided, accessToken)) {
      return {
        ok: false,
        status: 401,
        message: "Chybí nebo nesouhlasí hlavička x-ai-radar-token.",
      };
    }
    return { ok: true };
  }

  const hostname = normalizeHostname(request.headers.get("host") ?? "");
  if (LOCAL_HOSTS.has(hostname)) return { ok: true };
  if (hostname && allowedHosts.some((entry) => normalizeHostname(entry) === hostname)) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    message:
      `Aplikace běží na ne-lokální adrese (Host: ${hostname || "neznámý"}). ` +
      "Měnící endpointy vyžadují AI_RADAR_ACCESS_TOKEN a hlavičku x-ai-radar-token, " +
      "nebo hostitele uvedeného v AI_RADAR_ALLOWED_HOSTS.",
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse({ ok: false, error: message, code }, status);
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
