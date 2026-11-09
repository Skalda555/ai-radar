import { getDb } from "@/lib/db/client";
import { addSummaryPointToKnowledge } from "@/lib/knowledge/actions";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/**
 * Saves one paragraph of the Czech summary (or the deeper summary) into the
 * knowledge database as a curated key point.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { videoId } = await context.params;
  const body = await readJsonBody<{ text?: unknown; source?: unknown }>(request);
  const text = typeof body?.text === "string" ? body.text : "";
  const source = body?.source === "deep" ? "deep" : "summary";

  try {
    const result = addSummaryPointToKnowledge(getDb(), { videoId, text, source });
    if (!result.ok) {
      const status = result.code === "NO_ANALYSIS" ? 404 : 400;
      return errorResponse(result.message, status, result.code);
    }

    return jsonResponse({
      ok: true,
      itemId: result.itemId,
      alreadyStored: result.alreadyStored,
    });
  } catch (error) {
    console.error("summary-points failed", error);
    return errorResponse(
      `Poznatek se nepodařilo uložit: ${error instanceof Error ? error.message : "neznámá chyba"}`,
      500,
      "SAVE_FAILED",
    );
  }
}
