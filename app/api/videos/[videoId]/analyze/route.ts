import { getDb } from "@/lib/db/client";
import { startAnalysis } from "@/lib/jobs/service";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type AnalyzeBody = {
  confirm?: unknown;
  mode?: unknown;
  model?: unknown;
  allowReanalyze?: unknown;
  fetchImpl?: never;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { videoId } = await context.params;
  const body = await readJsonBody<AnalyzeBody>(request);
  if (!body) return errorResponse("Očekávám JSON tělo.", 400, "BAD_REQUEST");

  const mode = body.mode === "STATIC" ? "STATIC" : "AGENTIC";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;

  const result = await startAnalysis(getDb(), videoId, {
    confirmed: body.confirm === true,
    mode,
    model,
    allowReanalyze: body.allowReanalyze === true,
  });

  if (!result.ok) {
    return jsonResponse(
      {
        ok: false,
        error: result.message,
        code: result.code,
        job: result.job ?? null,
        model: getConfig().geminiModel,
      },
      result.status ?? 400,
    );
  }

  return jsonResponse({
    ok: true,
    job: result.job,
    analysisStatus: result.analysisStatus,
    message: result.message,
    model,
  });
}
