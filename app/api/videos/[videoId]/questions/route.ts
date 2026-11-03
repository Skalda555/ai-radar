import { getDb } from "@/lib/db/client";
import { askQuestion } from "@/lib/qa/service";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Body = { question?: unknown; confirm?: unknown };

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { videoId } = await context.params;
  const body = await readJsonBody<Body>(request);
  const question = typeof body?.question === "string" ? body.question : "";

  if (body?.confirm !== true) {
    return errorResponse(
      "Dotaz se neodešle bez potvrzení, že jde o placený API požadavek.",
      400,
      "CONFIRMATION_REQUIRED",
    );
  }

  const result = await askQuestion(getDb(), videoId, question);

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.message, code: result.code, question: result.row ?? null }, result.status);
  }

  return jsonResponse({ ok: true, question: result.row, message: result.message });
}
