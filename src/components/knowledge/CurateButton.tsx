"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

/**
 * Toggles one analysis item in the knowledge database. The same endpoint backs
 * the knowledge page, so a point added here appears there and vice versa.
 */
export function CurateButton({
  itemId,
  curated,
  className = "btn btn-sm",
}: {
  itemId: number;
  curated: boolean;
  className?: string;
}) {
  const [isCurated, setIsCurated] = useState(curated);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/analysis-items/${itemId}/curate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ curated: !isCurated }),
      });
      const payload = (await response.json()) as { ok?: boolean; curated?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setIsCurated(Boolean(payload.curated));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Uložení do databáze znalostí selhalo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        className={`${className} ${isCurated ? "btn-primary" : ""}`}
        onClick={toggle}
        disabled={pending}
        title={isCurated ? "Odebrat z databáze znalostí" : "Uložit do databáze znalostí"}
      >
        <Icon name={isCurated ? "check" : "book"} size={13} />
        {pending ? "Ukládám…" : isCurated ? "V databázi" : "Uložit do databáze"}
      </button>
      {error ? (
        <span className="tiny" style={{ color: "#E46B6B" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
