"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";
import { ReadAloud } from "./ReadAloud";

/**
 * Saves one summary paragraph into the knowledge database. The paragraph becomes
 * a curated key point, so it shows up in /znalosti and /databaze right away.
 */
function SavePointButton({
  videoId,
  text,
  source,
}: {
  videoId: string;
  text: string;
  source: "summary" | "deep";
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const router = useRouter();

  async function save() {
    setState("saving");
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}/summary-points`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, source }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  const label =
    state === "saving"
      ? "Ukládám…"
      : state === "saved"
        ? "V databázi znalostí"
        : state === "error"
          ? "Uložení selhalo"
          : "Uložit do znalostí";

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost"
      onClick={save}
      disabled={state === "saving" || state === "saved"}
      title={
        state === "saved"
          ? "Odstavec je uložený v databázi znalostí"
          : "Přidat tento odstavec do databáze znalostí"
      }
    >
      <Icon name={state === "saved" ? "check" : state === "error" ? "alert" : "book"} size={13} />
      {label}
    </button>
  );
}

function SummaryParagraphs({
  videoId,
  paragraphs,
  source,
  fallback,
}: {
  videoId: string;
  paragraphs: string[];
  source: "summary" | "deep";
  fallback?: string;
}) {
  if (paragraphs.length === 0) {
    return fallback ? <p>{fallback}</p> : null;
  }

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <div key={index} style={{ display: "grid", gap: 4 }}>
          <p>{paragraph}</p>
          <div style={{ marginBottom: 12 }}>
            <SavePointButton videoId={videoId} text={paragraph} source={source} />
          </div>
        </div>
      ))}
    </>
  );
}

export function SummarySection({
  videoId,
  summaryLong,
  initialDeep,
}: {
  videoId: string;
  summaryLong: string;
  initialDeep: string | null;
}) {
  const [deep, setDeep] = useState<string | null>(initialDeep);
  const [expanded, setExpanded] = useState(Boolean(initialDeep));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const paragraphs = summaryLong.split(/\n{2,}/).filter(Boolean);
  const deepParagraphs = (deep ?? "").split(/\n{2,}/).filter(Boolean);
  const readText = [summaryLong, expanded && deep ? deep : ""].filter(Boolean).join("\n\n");

  async function toggleDeep() {
    if (deep) {
      setExpanded((value) => !value);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}/deep-summary`, {
        method: "POST",
      });
      const payload = (await response.json()) as { ok?: boolean; text?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.text) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setDeep(payload.text);
      setExpanded(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Podrobnější shrnutí se nepodařilo vytvořit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="summary-head">
        <div className="eyebrow">České shrnutí</div>
        <div className="summary-actions">
          <ReadAloud text={readText} />
          <button type="button" className="btn btn-sm" onClick={toggleDeep} disabled={loading}>
            <Icon name={loading ? "sync" : "spark"} size={15} />
            {loading
              ? "Generuji…"
              : deep
                ? expanded
                  ? "Skrýt podrobnější"
                  : "Zobrazit podrobnější"
                : "Podrobnější shrnutí"}
          </button>
        </div>
      </div>

      <div className="prose-cs" style={{ marginTop: 8 }}>
        <SummaryParagraphs
          videoId={videoId}
          paragraphs={paragraphs}
          source="summary"
          fallback={summaryLong}
        />
      </div>

      {expanded && deep ? (
        <div className="deep-summary">
          <div className="eyebrow">Podrobnější shrnutí</div>
          <div className="prose-cs" style={{ marginTop: 8 }}>
            <SummaryParagraphs videoId={videoId} paragraphs={deepParagraphs} source="deep" />
          </div>
          <ReadAloud text={deep} label="Přečíst podrobné shrnutí" />
        </div>
      ) : null}

      {error ? (
        <div className="notice notice-danger" role="alert" style={{ marginTop: 10 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
