import { getDb } from "@/lib/db/client";
import { generateDeepSummary } from "@/lib/analysis/deep-summary";
import { errorResponse, guardMutation, jsonResponse } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { videoId } = await context.params;
  const result = await generateDeepSummary(getDb(), videoId);

  if (!result.ok) return errorResponse(result.message, result.status, result.code);
  return jsonResponse({ ok: true, text: result.text, message: "Podrobnější shrnutí je uložené." });
}
