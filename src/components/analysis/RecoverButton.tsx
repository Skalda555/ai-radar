"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function RecoverButton({ jobId }: { jobId: string }) {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/recover`, { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setState("idle");
      setMessage(payload.message ?? "Obnoveno.");
      router.refresh();
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Obnova selhala.");
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        className="btn btn-sm"
        onClick={run}
        disabled={state === "running"}
        title="Znovu ověří uloženou odpověď a uloží analýzu bez nového API požadavku"
      >
        <Icon name="download" size={13} /> {state === "running" ? "Obnovuji…" : "Obnovit z uložené odpovědi"}
      </button>
      {message ? (
        <span className="tiny" style={{ color: state === "error" ? "#E46B6B" : "#9FE3D4" }}>
          {message}
        </span>
      ) : null}
    </span>
  );
}
