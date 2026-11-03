import type { Db } from "../db/client";
import type { AnalysisItemRow, AnalysisRow, JobRow } from "../types";
import { dbAll, dbGet } from "../types";
import { formatDateCs, formatDateTimeCs } from "../shared/time";
import {
  CONFIDENCE_LABELS,
  EVIDENCE_KIND_LABELS,
  PROMPT_KIND_LABELS,
  VERIFICATION_HINTS,
  VERIFICATION_LABELS,
} from "../ui/labels";

export type ExportVideo = {
  video_id: string;
  title: string;
  url: string;
  published_at: string;
  channel_title: string;
  channel_id: string;
  is_demo: number;
};

export function loadAnalysisBundle(
  db: Db,
  videoId: string,
): { video: ExportVideo; analysis: AnalysisRow; items: AnalysisItemRow[]; job: JobRow | undefined } | null {
  const video = dbGet<ExportVideo>(
    db,
    `SELECT v.video_id, v.title, v.url, v.published_at, v.channel_id, v.is_demo, c.title AS channel_title
       FROM videos v JOIN channels c ON c.channel_id = v.channel_id
      WHERE v.video_id = ?`,
    videoId,
  );
  if (!video) return null;

  const analysis = dbGet<AnalysisRow>(db, `SELECT * FROM analyses WHERE video_id = ?`, videoId);
  if (!analysis) return null;

  const items = dbAll<AnalysisItemRow>(
    db,
    `SELECT * FROM analysis_items WHERE analysis_id = ? ORDER BY kind, ordinal, id`,
    analysis.id,
  );
  const job = dbGet<JobRow>(
    db,
    `SELECT * FROM analysis_jobs WHERE video_id = ? ORDER BY created_at DESC LIMIT 1`,
    videoId,
  );

  return { video, analysis, items, job };
}

function ts(seconds: number | null): string {
  if (seconds == null) return "";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function itemLine(item: AnalysisItemRow): string {
  const bits = [`- ${item.text_cs}`];
  if (item.detail_cs) bits.push(`  - Detail: ${item.detail_cs}`);
  if (item.timestamp_seconds != null) bits.push(`  - Čas: ${ts(item.timestamp_seconds)} (${item.timestamp_url ?? "—"})`);
  if (item.prompt_kind) bits.push(`  - Typ: ${PROMPT_KIND_LABELS[item.prompt_kind] ?? item.prompt_kind}`);
  if (item.tool_name && item.tool_url) bits.push(`  - Web: ${item.tool_url}`);
  bits.push(
    `  - Ověření: **${VERIFICATION_LABELS[item.verification_status] ?? item.verification_status}** — ${
      VERIFICATION_HINTS[item.verification_status] ?? ""
    }`,
  );
  if (item.evidence_quote) {
    bits.push(`  - Zdrojová evidence (${EVIDENCE_KIND_LABELS[item.evidence_kind ?? "NONE"] ?? "—"}): „${item.evidence_quote}“`);
  }
  if (item.confidence) bits.push(`  - ${CONFIDENCE_LABELS[item.confidence] ?? item.confidence}`);
  return bits.join("\n");
}

export function analysisToMarkdown(db: Db, videoId: string): string | null {
  const bundle = loadAnalysisBundle(db, videoId);
  if (!bundle) return null;
  const { video, analysis, items } = bundle;

  const byKind = (kind: string) => items.filter((item) => item.kind === kind);
  const lines: string[] = [];

  lines.push(`# ${analysis.title_cs ?? video.title}`);
  lines.push("");
  lines.push(`> Export z AI Radar · ${formatDateTimeCs(new Date().toISOString())}`);
  lines.push("");
  lines.push("## Zdroj");
  lines.push("");
  lines.push(`- Video: [${video.title}](${video.url})`);
  lines.push(`- Kanál: ${video.channel_title} (${video.channel_id})`);
  lines.push(`- Publikováno: ${formatDateCs(video.published_at)}`);
  lines.push(`- Video ID: ${video.video_id}`);
  if (analysis.is_demo || video.is_demo) {
    lines.push("- **DEMO DATA** – ukázkový záznam, nikoli skutečné YouTube video.");
  }
  lines.push("");

  lines.push("## Shrnutí");
  lines.push("");
  lines.push(`**Anotace:** ${analysis.summary_short_cs ?? ""}`);
  lines.push("");
  lines.push(analysis.summary_long_cs ?? "");
  lines.push("");
  lines.push(`- Hlavní téma: ${analysis.main_topic ?? "—"}`);
  lines.push(`- Kategorie: ${analysis.category ?? "—"}`);
  lines.push(`- Relevance po analýze: ${analysis.relevance_score ?? "—"} / 100`);
  if (analysis.relevance_explanation_cs) lines.push(`- Proč: ${analysis.relevance_explanation_cs}`);
  if (analysis.constraints_cs) lines.push(`- Omezení: ${analysis.constraints_cs}`);
  lines.push("");

  const sections: { kind: string; title: string }[] = [
    { kind: "KEY_POINT", title: "Klíčové poznatky" },
    { kind: "TIP", title: "Tipy a triky" },
    { kind: "TOOL", title: "Nástroje" },
    { kind: "PROMPT", title: "Prompty a příkazy" },
    { kind: "LIMITATION", title: "Omezení" },
    { kind: "USE_CASE", title: "Jak to mohu využít (Doporučení AI Radaru)" },
  ];

  for (const section of sections) {
    const group = byKind(section.kind);
    if (group.length === 0) continue;
    lines.push(`## ${section.title}`);
    lines.push("");
    for (const item of group) {
      if (section.kind === "PROMPT") {
        lines.push(`### ${PROMPT_KIND_LABELS[item.prompt_kind ?? ""] ?? item.prompt_kind ?? "Prompt"}`);
        lines.push("");
        lines.push("```text");
        lines.push(item.prompt_text ?? item.text_cs);
        lines.push("```");
        if (item.timestamp_seconds != null) {
          lines.push(`Čas: ${ts(item.timestamp_seconds)} – ${item.timestamp_url ?? ""}`);
        }
        lines.push(`Ověření: ${VERIFICATION_LABELS[item.verification_status] ?? item.verification_status}`);
        lines.push("");
      } else {
        lines.push(itemLine(item));
      }
    }
    lines.push("");
  }

  const workflows = byKind("WORKFLOW");
  if (workflows.length > 0) {
    lines.push("## Postupy");
    lines.push("");
    for (const workflow of workflows) {
      lines.push(`### ${workflow.text_cs}`);
      lines.push("");
      lines.push(`${workflow.detail_cs ?? ""}`);
      lines.push("");
      const steps = items
        .filter((item) => item.kind === "STEP" && item.group_key === workflow.group_key)
        .sort((a, b) => a.ordinal - b.ordinal);
      steps.forEach((step, index) => {
        lines.push(`${index + 1}. ${step.text_cs}${step.timestamp_seconds != null ? ` _(čas ${ts(step.timestamp_seconds)})_` : ""}`);
        if (step.detail_cs) {
          lines.push("");
          lines.push("   ```text");
          lines.push(`   ${step.detail_cs.replace(/\n/g, "\n   ")}`);
          lines.push("   ```");
        }
      });
      lines.push("");
    }
  }

  lines.push("## Ověření tvrzení");
  lines.push("");
  lines.push(
    "Platné schéma ani vysoká jistota modelu neznamenají nezávislé ověření. Výchozí stav každého tvrzení je AI extrakce.",
  );
  lines.push("");
  for (const [key, label] of Object.entries(VERIFICATION_LABELS)) {
    lines.push(`- **${label}** – ${VERIFICATION_HINTS[key]}`);
  }
  lines.push("");
  lines.push(`## Metadata analýzy`);
  lines.push("");
  lines.push(`- Model: ${analysis.model}`);
  lines.push(`- Prompt: ${analysis.prompt_version}`);
  lines.push(`- Schéma: v${analysis.schema_version}`);
  lines.push(`- Režim: ${analysis.mode}`);
  lines.push(`- Stav: ${analysis.status}`);
  lines.push(`- Vytvořeno: ${formatDateTimeCs(analysis.created_at)}`);

  return lines.join("\n");
}

export function analysisToJson(db: Db, videoId: string): object | null {
  const bundle = loadAnalysisBundle(db, videoId);
  if (!bundle) return null;
  const { video, analysis, items, job } = bundle;

  return {
    exported_at: new Date().toISOString(),
    exporter: "AI Radar",
    video: {
      video_id: video.video_id,
      title: video.title,
      url: video.url,
      channel: { channel_id: video.channel_id, title: video.channel_title },
      published_at: video.published_at,
      is_demo: Boolean(video.is_demo),
    },
    analysis: {
      status: analysis.status,
      model: analysis.model,
      prompt_version: analysis.prompt_version,
      schema_version: analysis.schema_version,
      mode: analysis.mode,
      created_at: analysis.created_at,
      title_original: analysis.title_original,
      title_cs: analysis.title_cs,
      summary_short_cs: analysis.summary_short_cs,
      summary_long_cs: analysis.summary_long_cs,
      main_topic: analysis.main_topic,
      category: analysis.category,
      constraints_cs: analysis.constraints_cs,
      relevance: {
        score: analysis.relevance_score,
        explanation_cs: analysis.relevance_explanation_cs,
        metric: "doporučovací metrika, nikoli důkaz pravdivosti",
      },
      interpretation_cs: analysis.interpretation_cs,
      interpretation_disclaimer: "Doporučení AI Radaru, nikoli tvrzení autora videa.",
      is_demo: Boolean(analysis.is_demo),
      job: job
        ? {
            id: job.id,
            status: job.status,
            interaction_id: job.interaction_id,
            http_status: job.http_status,
            error_code: job.error_code,
            error_message: job.error_message,
            token_input: job.token_input,
            token_output: job.token_output,
          }
        : null,
    },
    items: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      text_cs: item.text_cs,
      detail_cs: item.detail_cs,
      timestamp_seconds: item.timestamp_seconds,
      timestamp_url: item.timestamp_url,
      evidence: { quote: item.evidence_quote, kind: item.evidence_kind },
      confidence: item.confidence,
      verification_status: item.verification_status,
      verification_note: VERIFICATION_HINTS[item.verification_status] ?? null,
      tool: item.tool_name ? { name: item.tool_name, url: item.tool_url } : null,
      prompt: item.prompt_kind ? { kind: item.prompt_kind, text: item.prompt_text } : null,
      group_key: item.group_key,
      ordinal: item.ordinal,
    })),
  };
}
