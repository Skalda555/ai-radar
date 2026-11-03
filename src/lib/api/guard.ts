import { getConfig } from "../config";

export type GuardResult = { ok: true } | { ok: false; status: number; message: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * Mutating endpoints are local-only unless an access token is configured.
 * This keeps a personal tool from becoming an unauthenticated public API when
 * someone later exposes it by accident.
 */
export function guardMutation(request: Request): GuardResult {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return { ok: true };

  const { accessToken } = getConfig();
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

  const host = (request.headers.get("host") ?? "").toLowerCase();
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  if (LOCAL_HOSTS.has(hostname)) return { ok: true };

  return {
    ok: false,
    status: 403,
    message:
      "Aplikace běží na ne-lokální adrese. Měnící endpointy vyžadují AI_RADAR_ACCESS_TOKEN a hlavičku x-ai-radar-token.",
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
