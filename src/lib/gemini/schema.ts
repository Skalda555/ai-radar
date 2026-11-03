import { z } from "zod";

/**
 * Versioned contract for the analysis output. The model is asked for this exact
 * shape; Zod validates it before anything is written to SQLite.
 */
export const PROMPT_VERSION = "2026-11-v1";
export const SCHEMA_VERSION = 1;

const timestamp = z.number().int().min(0).max(24 * 3600).nullable();

export const analysisOutputSchema = z.object({
  title_original: z.string().min(1).max(400),
  title_cs: z.string().min(1).max(220),
  summary_short_cs: z.string().min(1).max(700),
  summary_long_cs: z.string().min(1).max(6000),
  main_topic: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  constraints_cs: z.string().max(2000).nullable(),
  insufficient_content: z.boolean(),
  insufficiency_reason_cs: z.string().max(600).nullable(),
  relevance: z.object({
    score: z.number().int().min(0).max(100),
    explanation_cs: z.string().min(1).max(1200),
  }),
  key_points: z
    .array(
      z.object({
        text_cs: z.string().min(1).max(700),
        timestamp_seconds: timestamp,
        evidence_quote: z.string().max(1200).nullable(),
        evidence_kind: z.enum(["TRANSCRIPT_QUOTE", "NARRATION", "VISUAL", "NONE"]),
        confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
      }),
    )
    .max(20),
  tips: z
    .array(
      z.object({
        text_cs: z.string().min(1).max(600),
        benefit_cs: z.string().min(1).max(400),
        timestamp_seconds: timestamp,
      }),
    )
    .max(15),
  workflows: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        purpose_cs: z.string().min(1).max(600),
        prerequisites_cs: z.array(z.string().max(300)).max(10),
        tools: z.array(z.string().max(80)).max(10),
        steps: z
          .array(
            z.object({
              text_cs: z.string().min(1).max(700),
              command: z.string().max(2000).nullable(),
              timestamp_seconds: timestamp,
            }),
          )
          .max(25),
        risks_cs: z.array(z.string().max(400)).max(10),
        timestamp_seconds: timestamp,
      }),
    )
    .max(5),
  tools: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        url: z.string().max(300).nullable(),
        demonstrated: z.boolean(),
        note_cs: z.string().max(400).nullable(),
      }),
    )
    .max(20),
  prompts: z
    .array(
      z.object({
        text: z.string().min(1).max(4000),
        kind: z.enum(["EXACT_QUOTE", "PARAPHRASE", "INCOMPLETE", "NOT_AVAILABLE"]),
        command_type: z.enum(["PROMPT", "COMMAND"]),
        timestamp_seconds: timestamp,
        note_cs: z.string().max(400).nullable(),
      }),
    )
    .max(15),
  interpretation: z.object({
    use_cases: z.array(z.object({ text_cs: z.string().min(1).max(700) })).max(10),
  }),
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export type ParseOutcome =
  | { ok: true; data: AnalysisOutput }
  | { ok: false; error: string; issues: string[] };

export function parseAnalysisOutput(raw: string): ParseOutcome {
  let json: unknown;
  const cleaned = stripCodeFence(raw);
  try {
    json = JSON.parse(cleaned);
  } catch (error) {
    return {
      ok: false,
      error: `Odpověď není platný JSON: ${error instanceof Error ? error.message : "chyba"}`,
      issues: [],
    };
  }

  const parsed = analysisOutputSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Odpověď neodpovídá schématu analýzy.",
      issues: parsed.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  return { ok: true, data: parsed.data };
}

export function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

/**
 * JSON Schema sent to the Interactions API as response_format.schema.
 * Kept to the documented subset: type / properties / required / items / enum / description.
 */
export const GEMINI_JSON_SCHEMA = {
  type: "object",
  properties: {
    title_original: { type: "string", description: "Původní název videa tak, jak je na YouTube." },
    title_cs: { type: "string", description: "Výstižný český název." },
    summary_short_cs: { type: "string", description: "Anotace na 1–3 věty." },
    summary_long_cs: { type: "string", description: "Podrobnější české shrnutí přiměřené obsahu." },
    main_topic: { type: "string", description: "Hlavní téma videa." },
    category: { type: "string", description: "Kategorie, např. AI agenti, Vibe coding, Nástroje." },
    constraints_cs: { type: "string", description: "Důležitá omezení nebo podmínky, jinak null." },
    insufficient_content: { type: "boolean", description: "true, pokud video nemá dost obsahu." },
    insufficiency_reason_cs: { type: "string", description: "Důvod nedostatku obsahu, jinak null." },
    relevance: {
      type: "object",
      properties: {
        score: { type: "integer", description: "Relevance 0–100 pro zadaný profil zájmů." },
        explanation_cs: { type: "string", description: "Proč takové skóre, konkrétně." },
      },
      required: ["score", "explanation_cs"],
    },
    key_points: {
      type: "array",
      description: "Konkrétní tvrzení a poznatky autora.",
      items: {
        type: "object",
        properties: {
          text_cs: { type: "string" },
          timestamp_seconds: { type: "integer", description: "Sekundy od začátku, jinak null." },
          evidence_quote: { type: "string", description: "Doslovný úryvek nebo popis obrazové evidence, jinak null." },
          evidence_kind: { type: "string", enum: ["TRANSCRIPT_QUOTE", "NARRATION", "VISUAL", "NONE"] },
          confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
        },
        required: ["text_cs", "timestamp_seconds", "evidence_quote", "evidence_kind", "confidence"],
      },
    },
    tips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text_cs: { type: "string" },
          benefit_cs: { type: "string" },
          timestamp_seconds: { type: "integer" },
        },
        required: ["text_cs", "benefit_cs", "timestamp_seconds"],
      },
    },
    workflows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          purpose_cs: { type: "string" },
          prerequisites_cs: { type: "array", items: { type: "string" } },
          tools: { type: "array", items: { type: "string" } },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text_cs: { type: "string" },
                command: { type: "string" },
                timestamp_seconds: { type: "integer" },
              },
              required: ["text_cs", "command", "timestamp_seconds"],
            },
          },
          risks_cs: { type: "array", items: { type: "string" } },
          timestamp_seconds: { type: "integer" },
        },
        required: [
          "name",
          "purpose_cs",
          "prerequisites_cs",
          "tools",
          "steps",
          "risks_cs",
          "timestamp_seconds",
        ],
      },
    },
    tools: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          url: { type: "string" },
          demonstrated: { type: "boolean" },
          note_cs: { type: "string" },
        },
        required: ["name", "url", "demonstrated", "note_cs"],
      },
    },
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          kind: {
            type: "string",
            enum: ["EXACT_QUOTE", "PARAPHRASE", "INCOMPLETE", "NOT_AVAILABLE"],
          },
          command_type: { type: "string", enum: ["PROMPT", "COMMAND"] },
          timestamp_seconds: { type: "integer" },
          note_cs: { type: "string" },
        },
        required: ["text", "kind", "command_type", "timestamp_seconds", "note_cs"],
      },
    },
    interpretation: {
      type: "object",
      properties: {
        use_cases: {
          type: "array",
          items: {
            type: "object",
            properties: { text_cs: { type: "string" } },
            required: ["text_cs"],
          },
        },
      },
      required: ["use_cases"],
    },
  },
  required: [
    "title_original",
    "title_cs",
    "summary_short_cs",
    "summary_long_cs",
    "main_topic",
    "category",
    "constraints_cs",
    "insufficient_content",
    "insufficiency_reason_cs",
    "relevance",
    "key_points",
    "tips",
    "workflows",
    "tools",
    "prompts",
    "interpretation",
  ],
} as const;
