"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";
import { statusLabel } from "@/lib/ui/labels";

type JobPayload = {
  ok?: boolean;
  job?: { id: string; status: string; error_message?: string | null };
  message?: string;
  error?: string;
};

const ACTIVE = new Set(["PENDING", "SUBMITTED", "IN_PROGRESS"]);

/**
 * Polls the provider with GET only, and stops as soon as the job is terminal.
 * A status check never creates a new interaction.
 */
export function JobPoller({
  jobId,
  initialStatus,
  compact = false,
}: {
  jobId: string;
  initialStatus: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [checks, setChecks] = useState(0);
  const router = useRouter();
  const active = ACTIVE.has(status);

  useEffect(() => {
    if (!ACTIVE.has(initialStatus)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/poll`, { method: "POST" });
        const payload = (await response.json()) as JobPayload;
        if (cancelled) return;
        if (payload.job?.status) setStatus(payload.job.status);
        setMessage(payload.message ?? payload.error ?? null);
        setChecks((value) => value + 1);
        if (payload.job?.status && !ACTIVE.has(payload.job.status)) {
          router.refresh();
          return;
        }
        if (payload.job?.status && ACTIVE.has(payload.job.status)) {
          timer = setTimeout(check, 10_000);
        }
      } catch {
        if (!cancelled) setMessage("Kontrolu stavu se nepodařilo provést. Zkus ji znovu ručně.");
      }
    }

    timer = setTimeout(check, 2500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialStatus, jobId, router]);

  return (
    <div
      className="notice notice-info"
      role="status"
      style={{ alignItems: "flex-start", gap: 12, flexWrap: compact ? "wrap" : undefined }}
    >
      <span className="dot dot-pulse" style={{ color: "#40C9BD", marginTop: 6 }} />
      <div style={{ minWidth: 0 }}>
        <strong>{statusLabel(status)}</strong>
        {message ? (
          <div className="tiny" style={{ marginTop: 2, opacity: 0.85 }}>
            {message}
          </div>
        ) : (
          <div className="tiny" style={{ marginTop: 2, opacity: 0.85 }}>
            Stav se zjišťuje přes GET. Nový placený požadavek se neposílá.
          </div>
        )}
        {checks > 0 ? <div className="tiny" style={{ opacity: 0.6, marginTop: 2 }}>kontrol: {checks}</div> : null}
      </div>
    </div>
  );
}

export function ResumeJobsButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setState("running");
    try {
      const response = await fetch("/api/jobs/resume", { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setState("done");
      setMessage(payload.message ?? "Hotovo.");
      router.refresh();
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Obnovení selhalo.");
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn" onClick={run} disabled={state === "running"}>
        <Icon name="sync" size={16} />
        {state === "running" ? "Obnovuji…" : "Obnovit seznam"}
      </button>
      {message ? (
        <span className="tiny" style={{ color: state === "error" ? "#E46B6B" : "#8FE0BD" }} role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}
