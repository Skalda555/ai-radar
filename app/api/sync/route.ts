import { getDb } from "@/lib/db/client";
import { getChannel } from "@/lib/channels/service";
import { syncAllActive, syncChannel } from "@/lib/youtube/sync";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";
import { translatePendingTitles } from "@/lib/translate/titles";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type SyncBody = { channelId?: unknown };

export async function POST(request: Request): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const body = await readJsonBody<SyncBody>(request);
  const channelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
  const db = getDb();

  if (channelId) {
    const channel = getChannel(db, channelId);
    if (!channel) return errorResponse("Kanál není v databázi.", 404, "NOT_FOUND");
    const result = await syncChannel(db, channel, { trigger: "manual" });
    const summary = {
      totalNew: result.created,
      totalFound: result.found,
      failures: result.status === "OK" ? 0 : 1,
      results: [result],
    };
    return jsonResponse({ ok: result.status === "OK", summary, result }, result.status === "OK" ? 200 : 502);
  }

  const summary = await syncAllActive(db, { trigger: "all" });
  // Překlad názvů je best-effort: selhání překladu nesmí shodit synchronizaci.
  const translation = await translatePendingTitles(db, { limit: 50 }).catch(() => null);
  return jsonResponse(
    { ok: summary.failures === 0, summary, translation },
    summary.failures === 0 ? 200 : 207,
  );
}
