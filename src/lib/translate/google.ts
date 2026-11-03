import { decodeEntities } from "../shared/text";

/**
 * Google Cloud Translation v2. Only titles are sent, one batched request per
 * chunk, with a timeout and a response size cap. The key stays server-side.
 */
const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
const MAX_TEXTS_PER_CALL = 25;
const MAX_TEXT_LENGTH = 500;
const MAX_BYTES = 512 * 1024;

export type TranslateFailure = {
  ok: false;
  code: "MISSING_KEY" | "HTTP" | "TIMEOUT" | "NETWORK" | "PARSE" | "TOO_MANY";
  message: string;
  status?: number;
};

export type TranslateSuccess = {
  ok: true;
  translations: string[];
  detectedSources: (string | null)[];
  httpStatus: number;
};

export function isTranslationConfigured(apiKey: string | null | undefined): boolean {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

export async function translateTexts(
  texts: string[],
  options: {
    apiKey: string;
    source?: string;
    target?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<TranslateSuccess | TranslateFailure> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    return { ok: false, code: "MISSING_KEY", message: "Chybí GOOGLE_TRANSLATE_API_KEY." };
  }
  if (texts.length === 0) {
    return { ok: true, translations: [], detectedSources: [], httpStatus: 200 };
  }
  if (texts.length > MAX_TEXTS_PER_CALL) {
    return {
      ok: false,
      code: "TOO_MANY",
      message: `Najednou lze přeložit maximálně ${MAX_TEXTS_PER_CALL} textů.`,
    };
  }

  const payload: Record<string, unknown> = {
    q: texts.map((text) => text.slice(0, MAX_TEXT_LENGTH)),
    target: options.target ?? "cs",
    format: "text",
  };
  if (options.source) payload.source = options.source;

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, code: "TIMEOUT", message: "Google Translate neodpověděl v časovém limitu." };
    }
    return {
      ok: false,
      code: "NETWORK",
      message: error instanceof Error ? error.message : "Síťová chyba při volání překladu.",
    };
  }

  const text = await response.text();
  if (text.length > MAX_BYTES) {
    return { ok: false, code: "PARSE", message: "Odpověď překladu je příliš velká." };
  }
  if (!response.ok) {
    const reason = (() => {
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        return parsed.error?.message ?? "";
      } catch {
        return "";
      }
    })();
    return {
      ok: false,
      code: "HTTP",
      status: response.status,
      message:
        response.status === 403
          ? "Google Translate odmítl klíč (HTTP 403). Zkontroluj GOOGLE_TRANSLATE_API_KEY a povolené API."
          : `Google Translate vrátil HTTP ${response.status}.${reason ? ` ${reason.slice(0, 160)}` : ""}`,
    };
  }

  let parsed: { data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] } };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return { ok: false, code: "PARSE", message: "Odpověď překladu není platný JSON." };
  }

  const translations = parsed.data?.translations ?? [];
  if (translations.length !== texts.length) {
    return {
      ok: false,
      code: "PARSE",
      message: `Překlad vrátil ${translations.length} položek pro ${texts.length} vstupů.`,
    };
  }

  return {
    ok: true,
    translations: translations.map((item) => decodeEntities(item.translatedText ?? "")),
    detectedSources: translations.map((item) => item.detectedSourceLanguage ?? null),
    httpStatus: response.status,
  };
}
