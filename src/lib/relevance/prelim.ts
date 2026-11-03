import { daysSince } from "../shared/time";
import { fold } from "../shared/text";

/**
 * Cheap, explainable relevance from stored metadata only.
 * This never calls Gemini and never claims to be an analysis of the video.
 */

const TOPIC_RULES: { topic: string; keywords: string[] }[] = [
  {
    topic: "AI agenti",
    keywords: ["agent", "agenti", "agentic", "subagent", "subagenti", "agentni", "autonomous", "multi-agent"],
  },
  {
    topic: "Codex a Claude Code",
    keywords: ["codex", "claude code", "claude", "cursor", "antigravity", "windsurf", "copilot", "aider"],
  },
  {
    topic: "Vibe coding",
    keywords: ["vibe coding", "vibe", "no-code", "low-code", "lovable", "bolt.new", "v0"],
  },
  {
    topic: "Skills a MCP",
    keywords: ["skill", "skills", "mcp", "model context protocol", "plugin", "tool use"],
  },
  {
    topic: "AI modely",
    keywords: ["gpt", "gemini", "llama", "mistral", "qwen", "deepseek", "claude", "openai", "anthropic", "chatgpt", "llm", "llms", "model", "modely", "benchmark", "reasoning", "fine-tuning", "context window"],
  },
  {
    topic: "Open-source",
    keywords: ["open source", "open-source", "github", "repo", "fork", "self-hosted"],
  },
  {
    topic: "Automatizace",
    keywords: ["automatizace", "automation", "workflow", "pipeline", "n8n", "zapier", "make.com", "trigger"],
  },
  {
    topic: "Prompting",
    keywords: ["prompt", "prompty", "prompting", "context engineering", "system prompt"],
  },
  {
    topic: "Web a mobilni vyvoj",
    keywords: ["next.js", "nextjs", "react", "typescript", "tailwind", "supabase", "mobile", "ios", "android", "api"],
  },
  {
    topic: "RAG a data",
    keywords: ["rag", "embedding", "vector", "database", "sqlite", "postgres", "indexing", "retrieval"],
  },
];

function containsKeyword(haystack: string, needle: string): boolean {
  if (!needle) return false;
  // Short tokens ("ai", "mcp") are matched as whole words so they do not fire
  // inside unrelated Czech words. Longer tokens match as substrings because
  // Czech inflects them ("agenta", "prompty").
  if (needle.length <= 3) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(haystack);
  }
  return haystack.includes(needle);
}

export type PrelimDetail = {
  version: "prelim-v1";
  score: number;
  topics: string[];
  matched: { keyword: string; field: "title" | "description" }[];
  components: { keyword: number; recency: number; priority: number };
  reasons: string[];
};

export type PrelimInput = {
  title: string;
  description?: string | null;
  publishedAt: string;
  priority?: number | null;
  now?: number;
};

export function scorePreliminary(input: PrelimInput): PrelimDetail {
  const titleFolded = fold(input.title ?? "");
  const descriptionFolded = fold(input.description ?? "");

  const matched: { keyword: string; field: "title" | "description" }[] = [];
  const topics: string[] = [];
  const seenKeywords = new Set<string>();

  for (const rule of TOPIC_RULES) {
    let topicHit = false;
    for (const keyword of rule.keywords) {
      const foldedKeyword = fold(keyword);
      if (!foldedKeyword || seenKeywords.has(foldedKeyword)) continue;
      if (containsKeyword(titleFolded, foldedKeyword)) {
        matched.push({ keyword, field: "title" });
        seenKeywords.add(foldedKeyword);
        topicHit = true;
      } else if (containsKeyword(descriptionFolded, foldedKeyword)) {
        matched.push({ keyword, field: "description" });
        seenKeywords.add(foldedKeyword);
        topicHit = true;
      }
    }
    if (topicHit) topics.push(rule.topic);
  }

  const titleMatches = matched.filter((m) => m.field === "title").length;
  const keywordScore = Math.min(60, topics.length * 12 + Math.max(0, titleMatches - topics.length) * 4);

  const days = daysSince(input.publishedAt, input.now ?? Date.now());
  let recencyScore = 2;
  let recencyReason = "Datum publikace je starší než tři měsíce.";
  if (days === null) {
    recencyScore = 2;
    recencyReason = "Datum publikace se nepodařilo přečíst.";
  } else if (days <= 7) {
    recencyScore = 20;
    recencyReason = "Publikováno v posledních 7 dnech.";
  } else if (days <= 30) {
    recencyScore = 12;
    recencyReason = "Publikováno v posledních 30 dnech.";
  } else if (days <= 90) {
    recencyScore = 6;
    recencyReason = "Publikováno v posledních 3 měsících.";
  }

  const priority = clampPriority(input.priority);
  const priorityScore = [0, 20, 15, 10, 5, 0][priority] ?? 10;

  const reasons: string[] = [];
  if (topics.length > 0) {
    reasons.push(`Shoda s tématy: ${topics.slice(0, 3).join(", ")}.`);
  } else {
    reasons.push("Bez shody s klíčovými tématy – skóre vychází jen z data a priority kanálu.");
  }
  reasons.push(recencyReason);
  reasons.push(`Priorita kanálu ${priority}/5.`);

  const score = Math.max(0, Math.min(100, Math.round(keywordScore + recencyScore + priorityScore)));

  return {
    version: "prelim-v1",
    score,
    topics,
    matched: matched.slice(0, 25),
    components: { keyword: keywordScore, recency: recencyScore, priority: priorityScore },
    reasons,
  };
}

export function clampPriority(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function prelimLabel(score: number | null | undefined): string {
  if (score == null) return "bez odhadu";
  if (score >= 70) return "vysoká";
  if (score >= 40) return "střední";
  return "nízká";
}

export function buildSearchText(parts: (string | null | undefined)[]): string {
  return fold(parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" "));
}

export const PRELIM_TOPICS = TOPIC_RULES.map((rule) => rule.topic);
