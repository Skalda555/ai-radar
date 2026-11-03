"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function SyncButton({
  channelId,
  label,
  variant = "primary",
}: {
  channelId?: string;
  label?: string;
  variant?: "primary" | "plain";
}) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(channelId ? { channelId } : {}),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        summary?: { totalNew: number; failures: number; results: unknown[] };
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      const summary = payload.summary;
      setState("done");
      setMessage(
        summary
          ? `Hotovo: ${summary.totalNew} nových videí${summary.failures > 0 ? `, ${summary.failures} chyb` : ""}.`
          : "Synchronizace dokončena.",
      );
      router.refresh();
      setTimeout(() => setState("idle"), 4000);
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Synchronizace selhala.");
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        className={variant === "primary" ? "btn btn-primary" : "btn"}
        onClick={run}
        disabled={state === "running"}
      >
        <Icon name="sync" size={16} />
        {state === "running" ? "Synchronizuji…" : (label ?? "Synchronizovat nyní")}
      </button>
      {message ? (
        <span className="tiny" style={{ color: state === "error" ? "#E46B6B" : "#8FE0BD" }} role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}
