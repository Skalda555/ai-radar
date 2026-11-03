import { getDb, getDbPath } from "@/lib/db/client";
import { deleteChannel, getChannelDeletionImpact } from "@/lib/channels/service";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Preview of what a deletion would remove. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ channelId: string }> },
): Promise<Response> {
  const { channelId } = await context.params;
  const impact = getChannelDeletionImpact(getDb(), channelId);
  if (!impact) return errorResponse("Kanál není v databázi.", 404, "NOT_FOUND");
  return jsonResponse({ ok: true, impact });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ channelId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { channelId } = await context.params;
  const body = await readJsonBody<{ confirm?: unknown }>(request);
  if (body?.confirm !== true) {
    return errorResponse(
      "Smazání kanálu vyžaduje výslovné potvrzení (confirm: true).",
      409,
      "CONFIRMATION_REQUIRED",
    );
  }

  const result = deleteChannel(getDb(), channelId, { dbPath: getDbPath() });
  if (!result.ok) return errorResponse(result.message, result.status, result.code);

  return jsonResponse({
    ok: true,
    impact: result.impact,
    backupPath: result.backupPath,
    message: `Kanál smazán včetně ${result.impact.videos} videí a ${result.impact.analyses} analýz.`,
  });
}
