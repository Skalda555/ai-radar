"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function TranslateTitlesButton({ pending }: { pending: number }) {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch("/api/translations/titles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        remaining?: number;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setState("idle");
      setMessage(payload.message ?? "Přeloženo.");
      router.refresh();
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Překlad selhal.");
    }
  }

  if (pending <= 0) return null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="btn" onClick={run} disabled={state === "running"}>
        <Icon name="sync" size={15} />
        {state === "running" ? "Překládám…" : `Přeložit názvy (${pending})`}
      </button>
      {message ? (
        <span className="tiny" style={{ color: state === "error" ? "#E46B6B" : "#8FE0BD" }} role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}
