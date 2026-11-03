"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function KnowledgeItemActions({
  itemId,
  videoId,
  curated,
  videoHidden,
}: {
  itemId: number;
  videoId: string;
  curated: boolean;
  videoHidden: boolean;
}) {
  const [isCurated, setIsCurated] = useState(curated);
  const [isHidden, setIsHidden] = useState(videoHidden);
  const [pending, setPending] = useState<null | "hide" | "curate">(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function call(path: string, body: unknown, kind: "hide" | "curate") {
    setPending(kind);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        hidden?: boolean;
        curated?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      if (kind === "hide") setIsHidden(Boolean(payload.hidden));
      if (kind === "curate") setIsCurated(Boolean(payload.curated));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Akce selhala.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending !== null}
        onClick={() =>
          call(
            `/api/videos/${encodeURIComponent(videoId)}/knowledge-visibility`,
            { hidden: !isHidden },
            "hide",
          )
        }
        title={isHidden ? "Znovu zobrazit toto video v knihovně" : "Skrýt všechna tvrzení z tohoto videa"}
      >
        <Icon name={isHidden ? "check" : "close"} size={13} />
        {pending === "hide" ? "Měním…" : isHidden ? "Zobrazit video" : "Skrýt video"}
      </button>

      <button
        type="button"
        className={`btn btn-sm ${isCurated ? "btn-primary" : ""}`}
        disabled={pending !== null}
        onClick={() =>
          call(`/api/analysis-items/${itemId}/curate`, { curated: !isCurated }, "curate")
        }
        title={isCurated ? "Odebrat z databáze znalostí" : "Uložit do databáze znalostí"}
      >
        <Icon name={isCurated ? "check" : "book"} size={13} />
        {pending === "curate"
          ? "Ukládám…"
          : isCurated
            ? "V databázi"
            : "Uložit do databáze"}
      </button>

      {error ? (
        <span className="tiny" style={{ color: "#E46B6B" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
