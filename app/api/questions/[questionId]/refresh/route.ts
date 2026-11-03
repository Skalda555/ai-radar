import { getDb } from "@/lib/db/client";
import { refreshQuestion } from "@/lib/qa/service";
import { errorResponse, guardMutation, jsonResponse } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { questionId } = await context.params;
  const id = Number.parseInt(questionId, 10);
  if (!Number.isFinite(id) || id <= 0) return errorResponse("Neplatné ID dotazu.", 400);

  const result = await refreshQuestion(getDb(), id);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.message, code: result.code }, result.status);
  }

  return jsonResponse({ ok: true, question: result.row, message: result.message });
}
