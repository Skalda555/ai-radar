import { getDb } from "@/lib/db/client";
import { getPreferences, updatePreferences } from "@/lib/preferences";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return jsonResponse({ ok: true, preferences: getPreferences(getDb()) });
}

export async function POST(request: Request): Promise<Response> {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");

  const body = await readJsonBody<{
    analysisDailyLimit?: unknown;
    syncIntervalHours?: unknown;
    defaultAnalysisMode?: unknown;
    interestProfile?: unknown;
  }>(request);

  if (!body) return errorResponse("Očekávám JSON tělo.", 400);

  const db = getDb();
  const preferences = updatePreferences(db, {
    analysisDailyLimit:
      typeof body.analysisDailyLimit === "number" && Number.isFinite(body.analysisDailyLimit)
        ? body.analysisDailyLimit
        : undefined,
    syncIntervalHours:
      typeof body.syncIntervalHours === "number" && Number.isFinite(body.syncIntervalHours)
        ? body.syncIntervalHours
        : undefined,
    defaultAnalysisMode:
      body.defaultAnalysisMode === "STATIC" || body.defaultAnalysisMode === "AGENTIC"
        ? body.defaultAnalysisMode
        : undefined,
    interestProfile: Array.isArray(body.interestProfile)
      ? body.interestProfile.filter((item): item is string => typeof item === "string")
      : undefined,
  });

  return jsonResponse({ ok: true, preferences });
}
