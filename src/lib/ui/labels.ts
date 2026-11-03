import type { AnalysisItemRow, AnalysisRow, JobRow } from "../types";

export type VerificationStatus =
  | "AI_EXTRACTED"
  | "SOURCE_SUPPORTED"
  | "USER_VERIFIED"
  | "NOT_VERIFIED"
  | "DISPUTED";

export const VERIFICATION_LABELS: Record<string, string> = {
  AI_EXTRACTED: "AI extrakce",
  SOURCE_SUPPORTED: "Podloženo zdrojem",
  USER_VERIFIED: "Ručně ověřeno",
  NOT_VERIFIED: "Neověřeno",
  DISPUTED: "Zpochybněno",
};

export const VERIFICATION_HINTS: Record<string, string> = {
  AI_EXTRACTED: "Vytvořil model. Není to nezávislé ověření.",
  SOURCE_SUPPORTED: "Model doložil zdrojový úryvek. Stále nejde o nezávislé ověření.",
  USER_VERIFIED: "Ověřil jsi ty ručně u zdroje.",
  NOT_VERIFIED: "Bez doloženého zdroje.",
  DISPUTED: "Označeno jako chybné.",
};

export function verificationClass(status: string): string {
  switch (status) {
    case "USER_VERIFIED":
      return "chip chip-success";
    case "SOURCE_SUPPORTED":
      return "chip chip-teal";
    case "DISPUTED":
      return "chip chip-danger";
    case "NOT_VERIFIED":
      return "chip chip-warn";
    default:
      return "chip chip-neutral";
  }
}

export const STATUS_LABELS: Record<string, string> = {
  NOT_ANALYZED: "Neanalyzováno",
  PENDING: "Čeká",
  SUBMITTED: "Odesláno",
  IN_PROGRESS: "Zpracovává se",
  COMPLETED: "Hotovo",
  FAILED: "Selhalo",
  UNKNOWN: "Neznámý stav",
  INSUFFICIENT_CONTENT: "Málo obsahu",
  CANCELLED: "Zrušeno",
  RUNNING: "Běží",
  OK: "OK",
};

export function statusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
    case "OK":
      return "chip chip-success";
    case "IN_PROGRESS":
    case "SUBMITTED":
    case "RUNNING":
      return "chip chip-accent";
    case "PENDING":
      return "chip chip-warn";
    case "FAILED":
    case "DISPUTED":
      return "chip chip-danger";
    case "UNKNOWN":
      return "chip chip-warn";
    case "INSUFFICIENT_CONTENT":
      return "chip chip-neutral";
    default:
      return "chip chip-neutral";
  }
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return STATUS_LABELS.NOT_ANALYZED;
  return STATUS_LABELS[status] ?? status;
}

export const JOB_STATUS_EXPLANATIONS: Record<string, string> = {
  PENDING: "Úloha je založená, ale analytický požadavek ještě nebyl odeslán.",
  SUBMITTED: "Požadavek byl odeslán a čeká na potvrzení od Google.",
  IN_PROGRESS: "Google video zpracovává. Výsledek se načte přes GET, bez nového placeného požadavku.",
  COMPLETED: "Analýza je hotová a uložená.",
  FAILED: "Úloha skončila chybou (API, síť nebo neplatná odpověď). Automaticky se neopakuje; důvod je v chybové zprávě.",
  UNKNOWN:
    "Odpověď na vytvoření úlohy se ztratila. Nevíme, zda úloha existuje – nový požadavek se automaticky neodesílá.",
  INSUFFICIENT_CONTENT: "Video nemá dost obsahu pro poctivou analýzu. Nic se nedomýšlí.",
  CANCELLED: "Úloha byla zrušena.",
};

export const ITEM_KIND_LABELS: Record<string, string> = {
  KEY_POINT: "Klíčový poznatek",
  TIP: "Tip a trik",
  WORKFLOW: "Postup",
  STEP: "Krok",
  TOOL: "Nástroj",
  PROMPT: "Prompt nebo příkaz",
  LIMITATION: "Omezení",
  USE_CASE: "Praktické využití",
};

export const PROMPT_KIND_LABELS: Record<string, string> = {
  EXACT_QUOTE: "Doslovná citace",
  PARAPHRASE: "Parafráze",
  INCOMPLETE: "Neúplné",
  NOT_AVAILABLE: "Nedostupné",
};

export const EVIDENCE_KIND_LABELS: Record<string, string> = {
  TRANSCRIPT_QUOTE: "Doslovný úryvek",
  NARRATION: "Popis mluveného slova",
  VISUAL: "Obrazová evidence",
  NONE: "Bez evidence",
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: "vysoká jistota modelu",
  MEDIUM: "střední jistota modelu",
  LOW: "nízká jistota modelu",
};

export function groupItems(items: AnalysisItemRow[]): Record<string, AnalysisItemRow[]> {
  const groups: Record<string, AnalysisItemRow[]> = {
    KEY_POINT: [],
    TIP: [],
    WORKFLOW: [],
    STEP: [],
    TOOL: [],
    PROMPT: [],
    LIMITATION: [],
    USE_CASE: [],
  };
  for (const item of items) {
    (groups[item.kind] ??= []).push(item);
  }
  return groups;
}

export function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export type WorkflowStepExtra = { workflowKey?: string; command?: string | null };

export function workflowSteps(items: AnalysisItemRow[]): { workflow: AnalysisItemRow; steps: AnalysisItemRow[] }[] {
  const workflows = items.filter((item) => item.kind === "WORKFLOW");
  const steps = items.filter((item) => item.kind === "STEP");
  return workflows.map((workflow) => ({
    workflow,
    steps: steps
      .filter((step) => step.group_key === workflow.group_key)
      .sort((a, b) => a.ordinal - b.ordinal),
  }));
}

export function analysisIsDemo(analysis: AnalysisRow | undefined): boolean {
  return Boolean(analysis?.is_demo);
}

export function jobDuration(job: JobRow): string | null {
  if (!job.request_started_at) return null;
  const start = Date.parse(job.request_started_at);
  const end = job.completed_at ? Date.parse(job.completed_at) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}
