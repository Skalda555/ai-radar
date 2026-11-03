import { getDb } from "@/lib/db/client";
import { setVideoKnowledgeHidden } from "@/lib/knowledge/actions";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { videoId } = await context.params;
  const body = await readJsonBody<{ hidden?: unknown }>(request);
  if (typeof body?.hidden !== "boolean") {
    return errorResponse("Očekávám JSON { hidden: true|false }.", 400, "BAD_REQUEST");
  }

  const result = setVideoKnowledgeHidden(getDb(), videoId, body.hidden);
  if (!result.ok) return errorResponse("Video není v databázi.", 404, "NOT_FOUND");

  return jsonResponse({ ok: true, hidden: result.hidden, videoId });
}
