import { getDb } from "@/lib/db/client";
import { translatePendingTitles } from "@/lib/translate/titles";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const body = await readJsonBody<{ limit?: unknown }>(request);
  const limit = typeof body?.limit === "number" ? body.limit : 25;

  const result = await translatePendingTitles(getDb(), { limit });

  if (!result.ok) {
    const missingKey = getConfig().googleTranslateApiKey === null;
    return errorResponse(result.error ?? "Překlad selhal.", missingKey ? 409 : 502, missingKey ? "NO_API_KEY" : "TRANSLATE_ERROR");
  }

  return jsonResponse({
    ok: true,
    translated: result.translated,
    remaining: result.remaining,
    message:
      result.translated === 0
        ? "Všechny názvy už jsou přeložené."
        : `Přeloženo ${result.translated} názvů, zbývá ${result.remaining}.`,
  });
}
