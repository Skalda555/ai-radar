import { getDb } from "@/lib/db/client";
import { dbRun } from "@/lib/types";
import { nowIso } from "@/lib/shared/time";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";
import { getChannel } from "@/lib/channels/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ channelId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { channelId } = await context.params;
  const body = await readJsonBody<{ active?: unknown }>(request);
  if (typeof body?.active !== "boolean") {
    return errorResponse("Očekávám JSON { active: true|false }.", 400);
  }

  const db = getDb();
  const channel = getChannel(db, channelId);
  if (!channel) return errorResponse("Kanál není v databázi.", 404, "NOT_FOUND");

  dbRun(
    db,
    `UPDATE channels SET is_active = ?, updated_at = ? WHERE channel_id = ?`,
    body.active ? 1 : 0,
    nowIso(),
    channelId,
  );

  return jsonResponse({ ok: true, active: body.active, channelId });
}
