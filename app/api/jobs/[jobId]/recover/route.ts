import { getDb } from "@/lib/db/client";
import { recoverJobFromStoredRun } from "@/lib/jobs/recover";
import { errorResponse, guardMutation, jsonResponse } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { jobId } = await context.params;
  const result = recoverJobFromStoredRun(getDb(), jobId);

  if (!result.ok) {
    return errorResponse(result.message, result.status, result.code);
  }

  return jsonResponse({
    ok: true,
    job: result.job,
    analysisStatus: result.analysisStatus,
    message: result.message,
  });
}
