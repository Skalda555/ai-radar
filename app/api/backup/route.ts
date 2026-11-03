import { getDb, getDbPath } from "@/lib/db/client";
import { backupDatabase } from "@/lib/db/backup";
import { errorResponse, guardMutation, jsonResponse } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  try {
    const target = backupDatabase(getDb(), getDbPath(), "manual");
    return jsonResponse({ ok: true, path: target });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Zálohu nelze vytvořit.", 500);
  }
}
