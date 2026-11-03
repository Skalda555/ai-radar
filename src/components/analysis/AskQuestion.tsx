"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";
import { formatDateTimeCs } from "@/lib/shared/time";

export type QuestionItem = {
  id: number;
  question: string;
  answer_text: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  answered_at: string | null;
};

export function AskQuestion({
  videoId,
  questions,
  model,
  geminiKey,
}: {
  videoId: string;
  questions: QuestionItem[];
  model: string;
  geminiKey: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, sending]);

  async function submit() {
    if (text.trim().length < 3) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text.trim(), confirm: true }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setOpen(false);
      setText("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dotaz se nepodařilo odeslat.");
    } finally {
      setSending(false);
    }
  }

  async function refresh(questionId: number) {
    setRefreshing(questionId);
    try {
      const response = await fetch(`/api/questions/${questionId}/refresh`, { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      router.refresh();
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <section className="panel" style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, marginBottom: 3 }}>Něco ve videu není jasné?</h3>
          <p className="tiny muted" style={{ margin: 0 }}>
            Zeptej se na doplnění. Odpověď vychází z videa a uloží se k analýze. Zatím{" "}
            {questions.length === 1 ? "1 otázka" : `${questions.length} otázek`}.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setOpen(true)}
          disabled={!geminiKey}
          title={geminiKey ? undefined : "Chybí GEMINI_API_KEY"}
        >
          <Icon name="spark" size={16} /> Zeptat se na doplnění
        </button>
      </div>

      {questions.length > 0 ? (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {questions.map((item) => (
            <div key={item.id} className="item-block" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{item.question}</strong>
                <span className="tiny muted">{formatDateTimeCs(item.created_at)}</span>
                {item.status === "COMPLETED" ? (
                  <span className="chip chip-success">odpovězeno</span>
                ) : item.status === "FAILED" ? (
                  <span className="chip chip-danger">selhalo</span>
                ) : (
                  <span className="chip chip-warn">zpracovává se</span>
                )}
              </div>

              {item.answer_text ? (
                <p
                  className="prose-cs"
                  style={{ margin: "8px 0 0", fontSize: 14.5, whiteSpace: "pre-wrap" }}
                >
                  {item.answer_text}
                </p>
              ) : item.status === "IN_PROGRESS" || item.status === "PENDING" ? (
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => refresh(item.id)}
                    disabled={refreshing === item.id}
                  >
                    <Icon name="sync" size={13} /> {refreshing === item.id ? "Obnovuji…" : "Obnovit odpověď"}
                  </button>
                  <span className="tiny muted">Google ji ještě zpracovává.</span>
                </div>
              ) : (
                <p className="tiny" style={{ margin: "8px 0 0", color: "#F0A3A3" }}>
                  {item.error_message ?? "Odpověď se nezdařila."}
                </p>
              )}

              {item.answer_text ? (
                <p className="tiny" style={{ margin: "8px 0 0", color: "#6F7C8A" }}>
                  Odpověď je AI interpretace vycházející z videa; není to nezávislé ověření.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sending) setOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="qa-title" style={{ width: "min(620px, 100%)" }}>
            <div className="dialog-head">
              <div>
                <div className="eyebrow">Doplňující dotaz</div>
                <h2 id="qa-title">Zeptat se na video</h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                aria-label="Zavřít"
                disabled={sending}
                style={{ minHeight: 44, padding: "6px 9px" }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="dialog-body" style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="field-label" htmlFor="qa-question">
                  Tvůj dotaz
                </label>
                <textarea
                  id="qa-question"
                  className="input"
                  rows={4}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Např.: Jak přesně autor nastavil ten MCP server?"
                  maxLength={1000}
                  disabled={sending}
                  autoFocus
                  style={{ resize: "vertical" }}
                />
                <p className="tiny muted" style={{ margin: "5px 0 0" }}>
                  Model: <span className="mono">{model}</span> · video se posílá jako odkaz, ne stahování.
                </p>
              </div>



              {error ? (
                <div className="notice notice-danger" role="alert">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="dialog-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={sending}>
                Zrušit
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submit}
                disabled={sending || text.trim().length < 3}
              >
                <Icon name={sending ? "sync" : "spark"} size={15} />
                {sending ? "Ptám se…" : "Odeslat dotaz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
