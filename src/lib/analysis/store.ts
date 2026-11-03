import type { Db } from "../db/client";
import { withTransaction } from "../db/client";
import { nowIso } from "../shared/time";
import { buildSearchText } from "../relevance/prelim";
import { dbGet, dbRun } from "../types";
import { normalizeAnalysis, type NormalizedAnalysis } from "./normalize";
import type { AnalysisOutput } from "../gemini/schema";

export type SaveAnalysisInput = {
  videoId: string;
  jobId: string | null;
  model: string;
  promptVersion: string;
  mode: string;
  output: AnalysisOutput;
  rawOutput: string;
  tokenInput: number | null;
  tokenOutput: number | null;
  isDemo?: boolean;
  now?: () => string;
};

export function saveAnalysis(db: Db, input: SaveAnalysisInput): { analysisId: number; status: string } {
  const normalized = normalizeAnalysis(input.output, input.videoId);
  return saveNormalizedAnalysis(db, {
    ...input,
    normalized,
  });
}

export function saveNormalizedAnalysis(
  db: Db,
  input: Omit<SaveAnalysisInput, "output"> & { normalized: NormalizedAnalysis },
): { analysisId: number; status: string } {
  const now = input.now ?? nowIso;
  const timestamp = now();
  const normalized = input.normalized;

  const video = dbGet<{ title: string; channel_id: string }>(
    db,
    `SELECT title, channel_id FROM videos WHERE video_id = ?`,
    input.videoId,
  );
  if (!video) throw new Error(`Video ${input.videoId} není v databázi.`);

  const channel = dbGet<{ title: string }>(
    db,
    `SELECT title FROM channels WHERE channel_id = ?`,
    video.channel_id,
  );

  const searchText = buildSearchText([
    input.videoId,
    normalized.titleCs,
    normalized.summaryShort,
    normalized.summaryLong,
    normalized.mainTopic,
    normalized.category,
    normalized.interpretationCs,
    normalized.items.map((item) => `${item.textCs} ${item.detailCs ?? ""} ${item.promptText ?? ""}`).join(" "),
  ]);

  return withTransaction(db, () => {
    dbRun(
      db,
      `INSERT INTO analysis_runs (video_id, job_id, model, prompt_version, raw_output, parse_ok, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      input.videoId,
      input.jobId,
      input.model,
      input.promptVersion,
      input.rawOutput.slice(0, 200_000),
      input.isDemo ? 1 : 0,
      timestamp,
    );

    const existing = dbGet<{ id: number }>(db, `SELECT id FROM analyses WHERE video_id = ?`, input.videoId);

    let analysisId: number;
    if (existing) {
      analysisId = existing.id;
      // Drop stale full-text rows before the items they point at disappear.
      dbRun(
        db,
        `DELETE FROM knowledge_fts WHERE rowid IN (SELECT id FROM analysis_items WHERE analysis_id = ?)`,
        analysisId,
      );
      dbRun(db, `DELETE FROM analysis_items WHERE analysis_id = ?`, analysisId);
      dbRun(
        db,
        `UPDATE analyses SET
           job_id = ?, model = ?, prompt_version = ?, mode = ?, status = ?, schema_version = 1,
           title_original = ?, title_cs = ?, summary_short_cs = ?, summary_long_cs = ?,
           main_topic = ?, category = ?, constraints_cs = ?, relevance_score = ?,
           relevance_explanation_cs = ?, interpretation_cs = ?, tools_json = ?,
           raw_output = ?, normalized_json = ?, token_input = ?, token_output = ?,
           is_demo = ?, search_text = ?, updated_at = ?
         WHERE id = ?`,
        input.jobId,
        input.model,
        input.promptVersion,
        input.mode,
        normalized.status,
        normalized.titleOriginal,
        normalized.titleCs,
        normalized.summaryShort,
        normalized.summaryLong,
        normalized.mainTopic,
        normalized.category,
        normalized.constraintsCs,
        normalized.relevanceScore,
        normalized.relevanceExplanation,
        normalized.interpretationCs,
        normalized.toolsJson,
        input.rawOutput.slice(0, 200_000),
        JSON.stringify(normalized),
        input.tokenInput,
        input.tokenOutput,
        input.isDemo ? 1 : 0,
        searchText,
        timestamp,
        analysisId,
      );
    } else {
      analysisId = dbRun(
        db,
        `INSERT INTO analyses (
           video_id, job_id, model, prompt_version, mode, status, schema_version,
           title_original, title_cs, summary_short_cs, summary_long_cs, main_topic, category,
           constraints_cs, relevance_score, relevance_explanation_cs, interpretation_cs,
           tools_json, raw_output, normalized_json, token_input, token_output, is_demo,
           search_text, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.videoId,
        input.jobId,
        input.model,
        input.promptVersion,
        input.mode,
        normalized.status,
        normalized.titleOriginal,
        normalized.titleCs,
        normalized.summaryShort,
        normalized.summaryLong,
        normalized.mainTopic,
        normalized.category,
        normalized.constraintsCs,
        normalized.relevanceScore,
        normalized.relevanceExplanation,
        normalized.interpretationCs,
        normalized.toolsJson,
        input.rawOutput.slice(0, 200_000),
        JSON.stringify(normalized),
        input.tokenInput,
        input.tokenOutput,
        input.isDemo ? 1 : 0,
        searchText,
        timestamp,
        timestamp,
      ).lastInsertRowid;
    }

    for (const item of normalized.items) {
      const itemId = dbRun(
        db,
        `INSERT INTO analysis_items (
           analysis_id, video_id, kind, ordinal, group_key, text_cs, detail_cs,
           timestamp_seconds, timestamp_url, evidence_quote, evidence_kind, confidence,
           verification_status, tool_name, tool_url, prompt_kind, prompt_text, extra_json,
           is_demo, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AI_EXTRACTED', ?, ?, ?, ?, ?, ?, ?)`,
        analysisId,
        input.videoId,
        item.kind,
        item.ordinal,
        item.groupKey,
        item.textCs,
        item.detailCs,
        item.timestampSeconds,
        item.timestampUrl,
        item.evidenceQuote,
        item.evidenceKind,
        item.confidence,
        item.toolName,
        item.toolUrl,
        item.promptKind,
        item.promptText,
        item.extraJson,
        input.isDemo ? 1 : 0,
        timestamp,
      ).lastInsertRowid;

      dbRun(
        db,
        `INSERT INTO knowledge_fts (rowid, text_cs, detail_cs, tool_name, video_title, channel_title)
         VALUES (?, ?, ?, ?, ?, ?)`,
        itemId,
        item.textCs,
        item.detailCs ?? "",
        item.toolName ?? "",
        video.title,
        channel?.title ?? "",
      );
    }

    dbRun(
      db,
      `UPDATE videos SET analysis_relevance = ?, updated_at = ? WHERE video_id = ?`,
      normalized.relevanceScore,
      timestamp,
      input.videoId,
    );

    return { analysisId, status: normalized.status };
  });
}

export function deleteAnalysisFtsRows(db: Db, analysisId: number): void {
  dbRun(
    db,
    `DELETE FROM knowledge_fts WHERE rowid IN (SELECT id FROM analysis_items WHERE analysis_id = ?)`,
    analysisId,
  );
}
