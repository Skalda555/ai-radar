"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";
import { ReadAloud } from "./ReadAloud";

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
        {paragraphs.length > 0 ? (
          paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
        ) : (
          <p>{summaryLong}</p>
        )}
      </div>

      {expanded && deep ? (
        <div className="deep-summary">
          <div className="eyebrow">Podrobnější shrnutí</div>
          <div className="prose-cs" style={{ marginTop: 8 }}>
            {deepParagraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
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
