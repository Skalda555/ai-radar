import { getDb } from "@/lib/db/client";
import { analysisToJson, analysisToMarkdown } from "@/lib/export/analysis";
import { errorResponse, jsonResponse } from "@/lib/api/guard";
import { slugify } from "@/lib/shared/text";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const { videoId } = await context.params;
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "md";
  const db = getDb();

  if (format === "json") {
    const payload = analysisToJson(db, videoId);
    if (!payload) return errorResponse("Analýza neexistuje.", 404, "NOT_FOUND");
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="ai-radar-${videoId}.json"`,
        "cache-control": "no-store",
      },
    });
  }

  const markdown = analysisToMarkdown(db, videoId);
  if (!markdown) return errorResponse("Analýza neexistuje.", 404, "NOT_FOUND");
  const title = markdown.split("\n")[0]?.replace(/^#\s*/, "") ?? videoId;
  return new Response(markdown, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="ai-radar-${slugify(title)}.md"`,
      "cache-control": "no-store",
    },
  });
}

export { jsonResponse };
