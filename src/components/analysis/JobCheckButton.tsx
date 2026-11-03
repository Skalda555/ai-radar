"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function JobCheckButton({ jobId }: { jobId: string }) {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function check() {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/poll`, { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setState("idle");
      setMessage(payload.message ?? "Stav zkontrolován.");
      router.refresh();
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Kontrola selhala.");
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm" onClick={check} disabled={state === "running"}>
        <Icon name="sync" size={13} /> {state === "running" ? "Kontroluji…" : "Zkontrolovat stav"}
      </button>
      {message ? (
        <span className="tiny" style={{ color: state === "error" ? "#E46B6B" : "#9FE3D4" }}>
          {message}
        </span>
      ) : null}
    </span>
  );
}
