import { getDb } from "@/lib/db/client";
import { pollJob } from "@/lib/jobs/service";
import { errorResponse, guardMutation, jsonResponse } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { jobId } = await context.params;
  const result = await pollJob(getDb(), jobId);

  if (!result.job) {
    return jsonResponse({ ok: false, error: result.message }, 404);
  }

  return jsonResponse({
    ok: result.ok,
    job: result.job,
    message: result.message,
    changed: result.changed,
  });
}
