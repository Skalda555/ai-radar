/**
 * Minimal server-side client for the Gemini Interactions API (v1beta),
 * verified against https://ai.google.dev/gemini-api/docs/background-execution
 * and /docs/structured-output in November 2026.
 *
 * One POST creates an interaction. Status and results are read with GET only.
 * There is no automatic retry anywhere in this module.
 */

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GEMINI_API_REVISION = "2026-05-20";

export type InteractionStatus =
  | "in_progress"
  | "requires_action"
  | "completed"
  | "failed"
  | "cancelled";

export type InteractionUsage = {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_tokens?: number;
};

export type InteractionContentPart = {
  type?: string;
  text?: string;
  uri?: string;
};

export type InteractionStep = {
  type?: string;
  content?: InteractionContentPart[];
  signature?: string;
};

export type InteractionResponse = {
  id: string;
  status: InteractionStatus | string;
  output_text?: string;
  outputs?: InteractionStep[];
  steps?: InteractionStep[];
  model?: string;
  error?: { code?: string; message?: string };
  usage?: InteractionUsage;
};

/**
 * REST responses carry the answer in steps[].content[].text; `output_text` is an
 * SDK convenience field that the raw API does not always send. Both shapes are
 * accepted, in that order.
 */
export function interactionText(response: InteractionResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  const steps = response.steps ?? response.outputs ?? [];
  const parts: string[] = [];
  for (const step of steps) {
    if (step.type && step.type !== "model_output") continue;
    for (const part of step.content ?? []) {
      if (typeof part.text === "string" && part.text.length > 0) parts.push(part.text);
    }
  }
  return parts.join("");
}

export type GeminiFailure = {
  ok: false;
  kind: "HTTP" | "TIMEOUT" | "NETWORK" | "PARSE" | "CONFIG";
  message: string;
  httpStatus?: number;
  responseBody?: string;
};

export type GeminiSuccess = {
  ok: true;
  interaction: InteractionResponse;
  httpStatus: number;
  raw: string;
};

export type CreateInput = {
  apiKey: string;
  model: string;
  prompt: string;
  videoUrl: string;
  jsonSchema?: unknown;
  background: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const SAFE_ERROR_CHARS = 400;

function redact(text: string, apiKey: string): string {
  let out = text;
  if (apiKey) out = out.split(apiKey).join("[REDACTED]");
  return out.slice(0, SAFE_ERROR_CHARS);
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<
  | { kind: "response"; status: number; text: string }
  | { kind: "timeout" }
  | { kind: "network"; message: string }
> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": GEMINI_API_REVISION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    return { kind: "response", status: response.status, text };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { kind: "timeout" };
    return { kind: "network", message: error instanceof Error ? error.message : "Síťová chyba" };
  }
}

export async function createInteraction(input: CreateInput): Promise<GeminiSuccess | GeminiFailure> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 120_000;

  const body: Record<string, unknown> = {
    model: input.model,
    input: [
      { type: "text", text: input.prompt },
      { type: "video", uri: input.videoUrl },
    ],
    background: input.background,
    store: true,
  };
  if (input.jsonSchema) {
    body.response_format = {
      type: "text",
      mime_type: "application/json",
      schema: input.jsonSchema,
    };
  }

  const result = await postJson(GEMINI_API_BASE, input.apiKey, body, fetchImpl, timeoutMs);

  if (result.kind === "timeout") {
    return {
      ok: false,
      kind: "TIMEOUT",
      message:
        "Časový limit při vytváření interakce vypršel. Nevíme, zda Google úlohu přijal – stav je UNKNOWN a nový požadavek se automaticky neposílá.",
    };
  }
  if (result.kind === "network") {
    return {
      ok: false,
      kind: "NETWORK",
      message: `Síťová chyba při vytváření interakce: ${redact(result.message, input.apiKey)}. Stav je UNKNOWN.`,
    };
  }

  if (result.status < 200 || result.status >= 300) {
    return {
      ok: false,
      kind: "HTTP",
      httpStatus: result.status,
      message: `Gemini API vrátila HTTP ${result.status}.`,
      responseBody: redact(result.text, input.apiKey),
    };
  }

  let parsed: InteractionResponse;
  try {
    parsed = JSON.parse(result.text) as InteractionResponse;
  } catch {
    return {
      ok: false,
      kind: "PARSE",
      httpStatus: result.status,
      message: "Gemini API vrátila nečitelnou odpověď.",
      responseBody: redact(result.text, input.apiKey),
    };
  }

  if (!parsed.id || typeof parsed.id !== "string") {
    return {
      ok: false,
      kind: "PARSE",
      httpStatus: result.status,
      message: "Odpověď neobsahuje Interaction ID.",
      responseBody: redact(result.text, input.apiKey),
    };
  }

  return { ok: true, interaction: parsed, httpStatus: result.status, raw: result.text };
}

export async function getInteraction(input: {
  apiKey: string;
  interactionId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<GeminiSuccess | GeminiFailure> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(input.interactionId)}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        "x-goog-api-key": input.apiKey,
        "Api-Revision": GEMINI_API_REVISION,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, kind: "TIMEOUT", message: "Časový limit při zjišťování stavu vypršel." };
    }
    return {
      ok: false,
      kind: "NETWORK",
      message: `Síťová chyba při zjišťování stavu: ${redact(
        error instanceof Error ? error.message : "chyba",
        input.apiKey,
      )}`,
    };
  }

  const text = await response.text();
  if (response.status === 404) {
    return {
      ok: false,
      kind: "HTTP",
      httpStatus: 404,
      message:
        "Interakce už u Google neexistuje (expirace nebo smazání). Výsledek nelze znovu načíst.",
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      kind: "HTTP",
      httpStatus: response.status,
      message: `Gemini API vrátila HTTP ${response.status}.`,
      responseBody: redact(text, input.apiKey),
    };
  }

  try {
    const parsed = JSON.parse(text) as InteractionResponse;
    return { ok: true, interaction: parsed, httpStatus: response.status, raw: text };
  } catch {
    return {
      ok: false,
      kind: "PARSE",
      httpStatus: response.status,
      message: "Stav interakce se nepodařilo přečíst.",
      responseBody: redact(text, input.apiKey),
    };
  }
}
