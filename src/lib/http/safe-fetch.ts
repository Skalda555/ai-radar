/**
 * Outbound HTTP with an explicit host allowlist, hard timeout, response size
 * cap and redirect validation. External pages and feeds are untrusted input.
 */

export type SafeFetchFailureCode =
  | "HOST_BLOCKED"
  | "INVALID_URL"
  | "TIMEOUT"
  | "NETWORK"
  | "TOO_LARGE"
  | "HTTP_ERROR"
  | "BAD_REDIRECT";

export type SafeFetchResult =
  | { ok: true; status: number; body: string; finalUrl: string }
  | { ok: false; code: SafeFetchFailureCode; message: string; status?: number };

export type SafeFetchOptions = {
  allowedHosts: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 2;

function hostOf(url: URL): string {
  return url.hostname.toLowerCase();
}

export function isAllowedUrl(raw: string, allowedHosts: readonly string[]): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return allowedHosts.includes(hostOf(url));
  } catch {
    return false;
  }
}

export async function safeFetchText(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { ok: false, code: "INVALID_URL", message: "Neplatná URL." };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== "https:") {
      return { ok: false, code: "INVALID_URL", message: "Povolena je pouze HTTPS adresa." };
    }
    if (!options.allowedHosts.includes(hostOf(current))) {
      return {
        ok: false,
        code: "HOST_BLOCKED",
        message: `Hostitel ${hostOf(current)} není povolen.`,
      };
    }

    let response: Response;
    try {
      response = await fetchImpl(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: options.accept ?? "application/xml, text/xml;q=0.9, */*;q=0.5",
          "user-agent": "AI-Radar/1.0 (+local personal tool)",
          ...(options.headers ?? {}),
        },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        return { ok: false, code: "TIMEOUT", message: `Časový limit ${timeoutMs} ms vypršel.` };
      }
      return {
        ok: false,
        code: "NETWORK",
        message: error instanceof Error ? error.message : "Síťová chyba.",
      };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { ok: false, code: "BAD_REDIRECT", message: "Přesměrování bez cílové adresy." };
      }
      try {
        current = new URL(location, current);
      } catch {
        return { ok: false, code: "BAD_REDIRECT", message: "Neplatná adresa přesměrování." };
      }
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        code: "HTTP_ERROR",
        status: response.status,
        message: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }

    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      return {
        ok: false,
        code: "TOO_LARGE",
        message: `Odpověď je větší než limit ${maxBytes} B.`,
      };
    }

    if (!response.body) {
      return { ok: true, status: response.status, body: "", finalUrl: current.toString() };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return {
            ok: false,
            code: "TOO_LARGE",
            message: `Odpověď překročila limit ${maxBytes} B.`,
          };
        }
        chunks.push(value);
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        return { ok: false, code: "TIMEOUT", message: "Časový limit při čtení odpovědi vypršel." };
      }
      return {
        ok: false,
        code: "NETWORK",
        message: error instanceof Error ? error.message : "Chyba při čtení odpovědi.",
      };
    }

    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      ok: true,
      status: response.status,
      body: new TextDecoder("utf-8").decode(combined),
      finalUrl: current.toString(),
    };
  }

  return { ok: false, code: "BAD_REDIRECT", message: "Příliš mnoho přesměrování." };
}
