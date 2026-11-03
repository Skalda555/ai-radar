import { getDb } from "@/lib/db/client";
import { dbGet, dbRun } from "@/lib/types";
import { nowIso } from "@/lib/shared/time";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["USER_VERIFIED", "DISPUTED", "AI_EXTRACTED", "NOT_VERIFIED"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { itemId } = await context.params;
  const id = Number.parseInt(itemId, 10);
  if (!Number.isFinite(id) || id <= 0) return errorResponse("Neplatné ID položky.", 400);

  const body = await readJsonBody<{ status?: unknown; note?: unknown }>(request);
  const status = typeof body?.status === "string" ? body.status : "";
  if (!ALLOWED.has(status)) {
    return errorResponse("Povolené stavy: USER_VERIFIED, DISPUTED, AI_EXTRACTED, NOT_VERIFIED.", 400);
  }

  const db = getDb();
  const item = dbGet<{ id: number; is_demo: number }>(db, `SELECT id, is_demo FROM analysis_items WHERE id = ?`, id);
  if (!item) return errorResponse("Položka neexistuje.", 404, "NOT_FOUND");

  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  dbRun(
    db,
    `UPDATE analysis_items SET verification_status = ?, user_note = COALESCE(?, user_note), user_verdict_at = ? WHERE id = ?`,
    status,
    note,
    nowIso(),
    id,
  );

  return jsonResponse({ ok: true, status, id });
}
