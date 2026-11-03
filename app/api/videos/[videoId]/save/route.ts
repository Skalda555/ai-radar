import { getDb } from "@/lib/db/client";
import { dbGet, dbRun } from "@/lib/types";
import { nowIso } from "@/lib/shared/time";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { videoId } = await context.params;
  const body = await readJsonBody<{ saved?: unknown }>(request);
  if (typeof body?.saved !== "boolean") {
    return errorResponse("Očekávám JSON { saved: true|false }.", 400, "BAD_REQUEST");
  }

  const db = getDb();
  const video = dbGet<{ video_id: string }>(db, `SELECT video_id FROM videos WHERE video_id = ?`, videoId);
  if (!video) return errorResponse("Video není v databázi.", 404, "NOT_FOUND");

  if (body.saved) {
    dbRun(
      db,
      `INSERT INTO saved_videos (video_id, created_at) VALUES (?, ?)
       ON CONFLICT(video_id) DO NOTHING`,
      videoId,
      nowIso(),
    );
  } else {
    dbRun(db, `DELETE FROM saved_videos WHERE video_id = ?`, videoId);
  }

  return jsonResponse({ ok: true, saved: body.saved, videoId });
}
