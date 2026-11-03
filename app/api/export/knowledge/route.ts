import { getDb } from "@/lib/db/client";
import { loadKnowledgeItems, knowledgeToJson, knowledgeToMarkdown } from "@/lib/export/knowledge";
import { errorResponse } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "md";
  const ids = [...url.searchParams.getAll("ids"), ...url.searchParams.getAll("id")]
    .flatMap((value) => value.split(","))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 500);

  if (ids.length === 0) {
    return errorResponse("Vyber alespoň jeden poznatek (parametr ids).", 400, "NO_IDS");
  }

  const rows = loadKnowledgeItems(getDb(), ids);
  if (rows.length === 0) {
    return errorResponse("Vybrané poznatky neexistují.", 404, "NOT_FOUND");
  }

  if (format === "json") {
    return new Response(JSON.stringify(knowledgeToJson(rows), null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="ai-radar-poznatky.json"`,
        "cache-control": "no-store",
      },
    });
  }

  return new Response(knowledgeToMarkdown(rows), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="ai-radar-poznatky.md"`,
      "cache-control": "no-store",
    },
  });
}
