"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export { CopyButton } from "../ui/CopyButton";

export function VerifyControls({
  itemId,
  status,
}: {
  itemId: number;
  status: string;
}) {
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function mark(next: "USER_VERIFIED" | "DISPUTED" | "AI_EXTRACTED") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/analysis-items/${itemId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const payload = (await response.json()) as { ok?: boolean; status?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setCurrent(payload.status ?? next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Uložení ověření selhalo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        className={`btn btn-sm ${current === "USER_VERIFIED" ? "btn-primary" : ""}`}
        onClick={() => mark("USER_VERIFIED")}
        disabled={pending}
        aria-pressed={current === "USER_VERIFIED"}
        title="Označit jako ručně ověřené u zdroje"
      >
        <Icon name="check" size={13} /> Ověřeno
      </button>
      <button
        type="button"
        className={`btn btn-sm ${current === "DISPUTED" ? "btn-danger" : ""}`}
        onClick={() => mark("DISPUTED")}
        disabled={pending}
        aria-pressed={current === "DISPUTED"}
        title="Označit jako chybné"
      >
        <Icon name="alert" size={13} /> Chybné
      </button>
      {current !== "AI_EXTRACTED" ? (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => mark("AI_EXTRACTED")}
          disabled={pending}
          title="Vrátit na původní stav AI extrakce"
        >
          Zrušit
        </button>
      ) : null}
      {error ? (
        <span className="tiny" style={{ color: "#E46B6B" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
