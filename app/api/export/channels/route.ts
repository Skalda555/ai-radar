import { getDb } from "@/lib/db/client";
import { filterChannels } from "@/lib/channels/filter";
import { channelsToCsv, channelsToJson, loadChannelsForExport } from "@/lib/export/channels";

export const dynamic = "force-dynamic";

/**
 * Read-only export of the channel list. `q` narrows the export exactly like the
 * channels page does, so a filtered view and its download always match.
 * `active=1` / `active=0` limits the file to active or paused channels.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const query = (url.searchParams.get("q") ?? "").slice(0, 200);
  const activeParam = url.searchParams.get("active");

  let rows = loadChannelsForExport(getDb());

  if (activeParam === "1" || activeParam === "0") {
    const wantActive = activeParam === "1";
    rows = rows.filter((row) => Boolean(row.is_active) === wantActive);
  }

  rows = filterChannels(rows, query);

  if (format === "json") {
    return new Response(JSON.stringify(channelsToJson(rows), null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="ai-radar-kanaly.json"',
        "cache-control": "no-store",
      },
    });
  }

  return new Response(channelsToCsv(rows), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="ai-radar-kanaly.csv"',
      "cache-control": "no-store",
    },
  });
}
