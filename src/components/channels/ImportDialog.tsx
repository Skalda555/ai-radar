"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

type ImportStatus = "NEW" | "ALREADY_EXISTS" | "DUPLICATE_IN_FILE" | "INVALID" | "HANDLE_UNRESOLVED";

type PreviewRow = {
  line: number;
  input: string;
  channelId: string | null;
  handle: string | null;
  name: string | null;
  category: string | null;
  priority: number;
  status: ImportStatus;
  reason: string | null;
};

type Summary = Record<ImportStatus, number> & { total: number };

const STATUS_LABEL: Record<ImportStatus, string> = {
  NEW: "nový",
  ALREADY_EXISTS: "už existuje",
  DUPLICATE_IN_FILE: "duplicita v souboru",
  INVALID: "neplatný",
  HANDLE_UNRESOLVED: "handle k převodu",
};

const STATUS_CLASS: Record<ImportStatus, string> = {
  NEW: "chip chip-success",
  ALREADY_EXISTS: "chip chip-neutral",
  DUPLICATE_IN_FILE: "chip chip-warn",
  INVALID: "chip chip-danger",
  HANDLE_UNRESOLVED: "chip chip-accent",
};

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "resolve" | "commit">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function post(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.ok !== true) {
      throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
    }
    return payload;
  }

  async function onFile(file: File | null) {
    setError(null);
    setMessage(null);
    setRows([]);
    setSummary(null);
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError("Soubor je větší než 1 MB. Import je omezen na 1 MB a 1 000 záznamů.");
      return;
    }
    const text = await file.text();
    setFilename(file.name);
    setContent(text);
    setBusy("preview");
    try {
      const payload = await post("/api/import/preview", { filename: file.name, content: text });
      setRows(payload.rows as PreviewRow[]);
      setSummary(payload.summary as Summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Náhled selhal.");
    } finally {
      setBusy(null);
    }
  }

  async function resolveHandles() {
    setBusy("resolve");
    setError(null);
    try {
      const payload = await post("/api/import/resolve", { filename, content, limit: 10 });
      setRows(payload.rows as PreviewRow[]);
      setSummary(payload.summary as Summary);
      setMessage(
        `Převedeno ${payload.resolved} handle adres. Zbývá ${payload.remaining}.` +
          (Array.isArray(payload.errors) && payload.errors.length > 0
            ? ` Poznámka: ${(payload.errors as string[]).join(" ")}`
            : ""),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Převod handle selhal.");
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    setBusy("commit");
    setError(null);
    try {
      const payload = await post("/api/import/commit", { rows });
      setMessage(
        `Import dokončen: ${payload.inserted} nových kanálů, ${payload.skipped} přeskočeno, ${payload.invalid} odmítnuto.`,
      );
      setRows([]);
      setSummary(null);
      setContent("");
      setFilename("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import selhal.");
    } finally {
      setBusy(null);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
    setMessage(null);
  }

  const newCount = summary?.NEW ?? 0;
  const unresolved = summary?.HANDLE_UNRESOLVED ?? 0;

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Icon name="upload" size={16} /> Importovat kanály
      </button>

      {open ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" style={{ width: "min(920px, 100%)" }}>
            <div className="dialog-head">
              <div>
                <div className="eyebrow">CSV / JSON · max 1 MB a 1 000 záznamů</div>
                <h2 id="import-title">Importovat kanály</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={close} aria-label="Zavřít" style={{ minHeight: 40, padding: "6px 9px" }}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="dialog-body" style={{ display: "grid", gap: 14 }}>
              <div className="import-source">
                <div>
                  <label className="field-label" htmlFor="import-file">
                    Soubor CSV nebo JSON
                  </label>
                  <input
                    id="import-file"
                    className="input"
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={(event) => onFile(event.target.files?.[0] ?? null)}
                    disabled={busy !== null}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <a className="btn btn-sm" href="/samples/channels.csv" download>
                    <Icon name="download" size={14} /> CSV vzor
                  </a>
                  <a className="btn btn-sm" href="/samples/channels.json" download>
                    <Icon name="download" size={14} /> JSON vzor
                  </a>
                </div>
              </div>

              <p className="tiny muted" style={{ margin: 0 }}>
                Náhled pouze parsuje soubor a kontroluje databázi – neprovádí žádné síťové volání.
                Převod @handle na Channel ID je samostatné tlačítko s omezeným počtem požadavků.
              </p>

              {busy === "preview" ? <div className="notice notice-info">Načítám náhled…</div> : null}

              {summary ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="chip chip-success">{summary.NEW} nových</span>
                  <span className="chip chip-neutral">{summary.ALREADY_EXISTS} existuje</span>
                  <span className="chip chip-warn">{summary.DUPLICATE_IN_FILE} duplicit</span>
                  <span className="chip chip-danger">{summary.INVALID} neplatných</span>
                  <span className="chip chip-accent">{summary.HANDLE_UNRESOLVED} handle</span>
                  <span className="chip chip-neutral">celkem {summary.total}</span>
                </div>
              ) : null}

              {rows.length > 0 ? (
                <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--color-line)", borderRadius: 10 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Vstup</th>
                        <th>Název</th>
                        <th>Channel ID</th>
                        <th>Stav</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={`${row.line}-${index}`}>
                          <td className="mono">{row.line}</td>
                          <td style={{ maxWidth: 220, wordBreak: "break-word" }}>{row.input || "—"}</td>
                          <td>{row.name ?? "—"}</td>
                          <td className="mono" style={{ maxWidth: 190, wordBreak: "break-word" }}>
                            {row.channelId ?? "—"}
                          </td>
                          <td>
                            <span className={STATUS_CLASS[row.status]} title={row.reason ?? undefined}>
                              {STATUS_LABEL[row.status]}
                            </span>
                            {row.reason ? (
                              <div className="tiny muted" style={{ marginTop: 3, maxWidth: 240 }}>
                                {row.reason}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {unresolved > 0 ? (
                <div className="notice notice-info" style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <span>
                    {unresolved} řádků má jen @handle. Převod vyžaduje <span className="mono">YOUTUBE_API_KEY</span>{" "}
                    a odešle max 10 požadavků za kliknutí.
                  </span>
                  <button type="button" className="btn btn-sm" onClick={resolveHandles} disabled={busy !== null}>
                    <Icon name="sync" size={14} /> Převést handle
                  </button>
                </div>
              ) : null}

              {message ? (
                <div className="notice notice-info" role="status">
                  {message}
                </div>
              ) : null}
              {error ? (
                <div className="notice notice-danger" role="alert">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="dialog-foot">
              <span className="tiny muted" style={{ marginRight: "auto" }}>
                Import nikdy nespouští synchronizaci ani Gemini analýzu.
              </span>
              <button type="button" className="btn btn-ghost" onClick={close} disabled={busy !== null}>
                Zavřít
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={commit}
                disabled={busy !== null || newCount === 0}
                title={newCount === 0 ? "Nejsou žádné nové kanály k importu" : `Importovat ${newCount} kanálů`}
              >
                <Icon name="check" size={15} />
                {busy === "commit" ? "Importuji…" : `Importovat ${newCount}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
