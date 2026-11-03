import { getDb } from "@/lib/db/client";
import { setChannelCategory } from "@/lib/channels/service";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ channelId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { channelId } = await context.params;
  const body = await readJsonBody<{ category?: unknown }>(request);
  if (body?.category !== null && typeof body?.category !== "string") {
    return errorResponse("Očekávám JSON { category: string|null }.", 400, "BAD_REQUEST");
  }

  const result = setChannelCategory(getDb(), channelId, body.category);
  if (!result.ok) return errorResponse("Kanál není v databázi.", 404, "NOT_FOUND");

  return jsonResponse({ ok: true, category: result.category, channelId });
}