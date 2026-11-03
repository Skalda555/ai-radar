import { getDb } from "@/lib/db/client";
import { setItemCurated } from "@/lib/knowledge/actions";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const { itemId } = await context.params;
  const id = Number.parseInt(itemId, 10);
  if (!Number.isFinite(id) || id <= 0) return errorResponse("Neplatné ID položky.", 400);

  const body = await readJsonBody<{ curated?: unknown }>(request);
  if (typeof body?.curated !== "boolean") {
    return errorResponse("Očekávám JSON { curated: true|false }.", 400, "BAD_REQUEST");
  }

  const result = setItemCurated(getDb(), id, body.curated);
  if (!result.ok) return errorResponse("Položka neexistuje.", 404, "NOT_FOUND");

  return jsonResponse({ ok: true, curated: result.curated, id });
}
