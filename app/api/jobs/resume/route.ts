import { getDb } from "@/lib/db/client";
import { resumePendingJobs } from "@/lib/jobs/service";
import { errorResponse, guardMutation, jsonResponse } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const db = getDb();
  const result = await resumePendingJobs(db);
  return jsonResponse({
    ok: true,
    ...result,
    message:
      result.polled === 0
        ? "Žádná úloha nečeká na obnovení."
        : `Zkontrolováno ${result.polled} úloh, ${result.completed} dokončeno.`,
  });
}
