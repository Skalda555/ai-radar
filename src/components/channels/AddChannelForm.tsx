"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

type Result =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string; code?: string };

const SUGGESTED_CATEGORIES = [
  "AI vývoj",
  "AI modely",
  "Agenti",
  "Open source",
  "Nástroje",
  "Výzkum",
  "Byznys",
  "Hardware",
];

export function AddChannelForm({
  compact = false,
  suggestions = [],
}: {
  compact?: boolean;
  suggestions?: string[];
}) {
  const categoryOptions = Array.from(new Set([...suggestions, ...SUGGESTED_CATEGORIES]));
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState("3");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim()) {
      setResult({ kind: "error", message: "Vlož @handle, URL kanálu nebo Channel ID." });
      return;
    }
    setResult({ kind: "pending" });
    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: input.trim(),
          priority: Number(priority),
          category: category.trim() || null,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        code?: string;
      };
      if (!response.ok || !payload.ok) {
        setResult({
          kind: "error",
          message: payload.error ?? `HTTP ${response.status}`,
          code: payload.code,
        });
        return;
      }
      setResult({ kind: "ok", message: payload.message ?? "Kanál přidán." });
      setInput("");
      setCategory("");
      router.refresh();
    } catch (caught) {
      setResult({
        kind: "error",
        message: caught instanceof Error ? caught.message : "Přidání kanálu selhalo.",
      });
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      <div className="add-channel-grid">
        <div style={{ minWidth: 0 }}>
          <label className="field-label" htmlFor="channel-input">
            Kanál
          </label>
          <input
            id="channel-input"
            className="input"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="@ColeMedin, youtube.com/@handle nebo UC…"
            autoComplete="off"
            spellCheck={false}
            disabled={result.kind === "pending"}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label className="field-label" htmlFor="channel-category">
            Kategorie
          </label>
          <input
            id="channel-category"
            className="input"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="AI vývoj, open source…"
            maxLength={60}
            autoComplete="off"
            list="channel-category-options"
            disabled={result.kind === "pending"}
          />
          <datalist id="channel-category-options">
            {categoryOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="field-label" htmlFor="channel-priority">
            Priorita
          </label>
          <select
            id="channel-priority"
            className="select"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            disabled={result.kind === "pending"}
          >
            <option value="1">1 – klíčový</option>
            <option value="2">2 – vysoká</option>
            <option value="3">3 – běžná</option>
            <option value="4">4 – nízká</option>
            <option value="5">5 – okrajová</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={result.kind === "pending"}>
          <Icon name={result.kind === "pending" ? "sync" : "plus"} size={16} />
          {result.kind === "pending" ? "Přidávám…" : "Přidat kanál"}
        </button>
      </div>

      <p className="tiny muted" style={{ margin: 0 }}>
        Přímé Channel ID (UC… + 22 znaků) funguje bez API klíče. @handle vyžaduje{" "}
        <span className="mono">YOUTUBE_API_KEY</span>. Po přidání se kanál hned synchronizuje.
      </p>

      {result.kind === "ok" ? (
        <div className="notice notice-info" role="status">
          {result.message}
        </div>
      ) : null}
      {result.kind === "error" ? (
        <div className="notice notice-danger" role="alert">
          <span>{result.message}</span>
          {result.code === "MISSING_API_KEY" ? (
            <span className="tiny" style={{ display: "block", marginTop: 4 }}>
              Alternativa bez klíče: otevři kanál na YouTube, v adrese je{" "}
              <span className="mono">/channel/UC…</span>, a vlož toto ID.
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
