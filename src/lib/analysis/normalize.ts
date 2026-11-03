import type { AnalysisOutput } from "../gemini/schema";
import { youtubeTimestampUrl } from "../shared/text";

export type NormalizedItem = {
  kind:
    | "KEY_POINT"
    | "TIP"
    | "WORKFLOW"
    | "STEP"
    | "TOOL"
    | "PROMPT"
    | "LIMITATION"
    | "USE_CASE";
  ordinal: number;
  groupKey: string | null;
  textCs: string;
  detailCs: string | null;
  timestampSeconds: number | null;
  timestampUrl: string | null;
  evidenceQuote: string | null;
  evidenceKind: string | null;
  confidence: string | null;
  toolName: string | null;
  toolUrl: string | null;
  promptKind: string | null;
  promptText: string | null;
  extraJson: string | null;
};

export type NormalizedAnalysis = {
  status: "COMPLETED" | "INSUFFICIENT_CONTENT";
  titleOriginal: string;
  titleCs: string;
  summaryShort: string;
  summaryLong: string;
  mainTopic: string;
  category: string;
  constraintsCs: string | null;
  relevanceScore: number;
  relevanceExplanation: string;
  interpretationCs: string;
  toolsJson: string | null;
  items: NormalizedItem[];
  insufficientReason: string | null;
};

/**
 * Model output becomes rows. Verification status is deliberately NOT set to
 * SOURCE_SUPPORTED here: a quote authored by the model is not independent proof.
 */
export function normalizeAnalysis(output: AnalysisOutput, videoId: string): NormalizedAnalysis {
  const items: NormalizedItem[] = [];
  let ordinal = 0;

  const stamp = (seconds: number | null) => ({
    timestampSeconds: seconds,
    timestampUrl: youtubeTimestampUrl(videoId, seconds),
  });

  for (const point of output.key_points) {
    items.push({
      kind: "KEY_POINT",
      ordinal: ordinal++,
      groupKey: null,
      textCs: point.text_cs,
      detailCs: null,
      ...stamp(point.timestamp_seconds),
      evidenceQuote: point.evidence_quote,
      evidenceKind: point.evidence_kind,
      confidence: point.confidence,
      toolName: null,
      toolUrl: null,
      promptKind: null,
      promptText: null,
      extraJson: null,
    });
  }

  for (const tip of output.tips) {
    items.push({
      kind: "TIP",
      ordinal: ordinal++,
      groupKey: null,
      textCs: tip.text_cs,
      detailCs: tip.benefit_cs,
      ...stamp(tip.timestamp_seconds),
      evidenceQuote: null,
      evidenceKind: null,
      confidence: null,
      toolName: null,
      toolUrl: null,
      promptKind: null,
      promptText: null,
      extraJson: null,
    });
  }

  output.workflows.forEach((workflow, index) => {
    const groupKey = `wf-${index + 1}`;
    items.push({
      kind: "WORKFLOW",
      ordinal: ordinal++,
      groupKey,
      textCs: workflow.name,
      detailCs: workflow.purpose_cs,
      ...stamp(workflow.timestamp_seconds),
      evidenceQuote: null,
      evidenceKind: null,
      confidence: null,
      toolName: null,
      toolUrl: null,
      promptKind: null,
      promptText: null,
      extraJson: JSON.stringify({
        prerequisites: workflow.prerequisites_cs,
        tools: workflow.tools,
        risks: workflow.risks_cs,
      }),
    });

    workflow.steps.forEach((step, stepIndex) => {
      items.push({
        kind: "STEP",
        ordinal: stepIndex,
        groupKey,
        textCs: step.text_cs,
        detailCs: step.command,
        ...stamp(step.timestamp_seconds),
        evidenceQuote: null,
        evidenceKind: null,
        confidence: null,
        toolName: null,
        toolUrl: null,
        promptKind: null,
        promptText: null,
        extraJson: null,
      });
    });
  });

  for (const tool of output.tools) {
    items.push({
      kind: "TOOL",
      ordinal: ordinal++,
      groupKey: null,
      textCs: tool.name,
      detailCs: tool.note_cs,
      ...stamp(null),
      evidenceQuote: null,
      evidenceKind: null,
      confidence: null,
      toolName: tool.name,
      toolUrl: safeHttpUrl(tool.url),
      promptKind: null,
      promptText: null,
      extraJson: JSON.stringify({ demonstrated: tool.demonstrated }),
    });
  }

  for (const prompt of output.prompts) {
    items.push({
      kind: "PROMPT",
      ordinal: ordinal++,
      groupKey: null,
      textCs: firstLine(prompt.text),
      detailCs: prompt.note_cs,
      ...stamp(prompt.timestamp_seconds),
      evidenceQuote: null,
      evidenceKind: null,
      confidence: null,
      toolName: null,
      toolUrl: null,
      promptKind: prompt.kind,
      promptText: prompt.text,
      extraJson: JSON.stringify({ commandType: prompt.command_type }),
    });
  }

  if (output.constraints_cs) {
    items.push({
      kind: "LIMITATION",
      ordinal: ordinal++,
      groupKey: null,
      textCs: output.constraints_cs,
      detailCs: null,
      ...stamp(null),
      evidenceQuote: null,
      evidenceKind: null,
      confidence: null,
      toolName: null,
      toolUrl: null,
      promptKind: null,
      promptText: null,
      extraJson: null,
    });
  }

  for (const useCase of output.interpretation.use_cases) {
    items.push({
      kind: "USE_CASE",
      ordinal: ordinal++,
      groupKey: null,
      textCs: useCase.text_cs,
      detailCs: null,
      ...stamp(null),
      evidenceQuote: null,
      evidenceKind: null,
      confidence: null,
      toolName: null,
      toolUrl: null,
      promptKind: null,
      promptText: null,
      extraJson: JSON.stringify({ source: "AI_RADAR_INTERPRETATION" }),
    });
  }

  const interpretation = output.interpretation.use_cases
    .map((item) => `• ${item.text_cs}`)
    .join("\n");

  return {
    status: output.insufficient_content ? "INSUFFICIENT_CONTENT" : "COMPLETED",
    titleOriginal: output.title_original,
    titleCs: output.title_cs,
    summaryShort: output.summary_short_cs,
    summaryLong: output.summary_long_cs,
    mainTopic: output.main_topic,
    category: output.category,
    constraintsCs: output.constraints_cs,
    relevanceScore: output.relevance.score,
    relevanceExplanation: output.relevance.explanation_cs,
    interpretationCs: interpretation,
    toolsJson: JSON.stringify(output.tools),
    // No fabricated content: when the model reports too little source material,
    // extracted items are discarded instead of being shown as knowledge.
    items: output.insufficient_content ? [] : items,
    insufficientReason: output.insufficiency_reason_cs,
  };
}

function firstLine(text: string): string {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function safeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
