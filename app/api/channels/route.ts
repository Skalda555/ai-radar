import { getDb } from "@/lib/db/client";
import { addChannelFromInput, canonicalCategory, listChannels } from "@/lib/channels/service";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";
import { clampPriority } from "@/lib/relevance/prelim";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const channels = listChannels(getDb());
  return jsonResponse({ ok: true, channels });
}

type AddChannelBody = {
  input?: unknown;
  priority?: unknown;
  category?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const body = await readJsonBody<AddChannelBody>(request);
  const rawInput = typeof body?.input === "string" ? body.input.trim() : "";
  if (!rawInput) {
    return errorResponse("Zadej @handle, URL kanálu nebo Channel ID.", 400, "INPUT_REQUIRED");
  }

  const db = getDb();
  const result = await addChannelFromInput(db, rawInput, {
    priority: clampPriority(typeof body?.priority === "number" ? body.priority : undefined),
    category: canonicalCategory(
      db,
      typeof body?.category === "string" ? body.category : null,
    ),
    source: "manual",
    syncNow: true,
  });

  if (result.status === "FAILED") {
    const status = result.code === "INVALID_INPUT" ? 400 : result.code === "MISSING_API_KEY" ? 409 : 502;
    return errorResponse(result.message, status, result.code);
  }

  return jsonResponse(
    {
      ok: true,
      status: result.status,
      channel: result.channel,
      sync: result.sync,
      message:
        result.status === "ALREADY_EXISTS"
          ? "Kanál už je ve sledovaných."
          : result.sync?.status === "OK"
            ? `Kanál přidán. Načteno ${result.sync.found} videí, ${result.sync.created} nových.`
            : "Kanál přidán, ale první synchronizaci se nepodařilo dokončit.",
    },
    result.status === "CREATED" ? 201 : 200,
  );
}
