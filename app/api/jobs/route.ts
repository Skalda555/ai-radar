import { getDb } from "@/lib/db/client";
import { dbAll } from "@/lib/types";
import { jsonResponse } from "@/lib/api/guard";
import type { JobRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const jobs = dbAll<JobRow & { video_title: string; channel_title: string }>(
    getDb(),
    `SELECT j.*, v.title AS video_title, c.title AS channel_title
       FROM analysis_jobs j
       JOIN videos v ON v.video_id = j.video_id
       JOIN channels c ON c.channel_id = v.channel_id
      ORDER BY j.created_at DESC
      LIMIT 100`,
  );
  return jsonResponse({ ok: true, jobs });
}
