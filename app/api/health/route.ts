import { getDb, getDbPath, appliedVersions, integrityCheck, tableCounts } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { jsonResponse } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/** Liveness + database sanity. Never returns key values or secrets. */
export async function GET(): Promise<Response> {
  const db = getDb();
  const integrity = integrityCheck(db);
  const config = getConfig();

  return jsonResponse({
    ok: integrity === "ok",
    app: "ai-radar",
    version: "1.0.0",
    database: {
      path: getDbPath(),
      schema: appliedVersions(db),
      integrity,
      counts: tableCounts(db),
    },
    services: {
      youtubeKey: config.youtubeApiKey !== null,
      geminiKey: config.geminiApiKey !== null,
      model: config.geminiModel,
      automaticAnalysis: false,
    },
  });
}
