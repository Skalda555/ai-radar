"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function DeleteChannelButton({
  channelId,
  title,
  videos,
  analyses,
  saved,
}: {
  channelId: string;
  title: string;
  videos: number;
  analyses: number;
  saved: number;
}) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}/delete`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Smazání selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-danger"
        onClick={() => setOpen(true)}
        title="Smazat kanál i s jeho daty"
      >
        <Icon name="close" size={13} /> Smazat
      </button>

      {open ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-channel-title" style={{ width: "min(560px, 100%)" }}>
            <div className="dialog-head">
              <div>
                <div className="eyebrow">Nevratná akce</div>
                <h2 id="delete-channel-title">Smazat kanál?</h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                aria-label="Zavřít"
                disabled={busy}
                style={{ minHeight: 44, padding: "6px 9px" }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="dialog-body" style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0 }}>
                <strong>{title}</strong>
              </p>
              <p className="tiny muted" style={{ margin: 0 }}>
                Smaže se <strong>{videos}</strong> videí, <strong>{analyses}</strong> analýz a{" "}
                <strong>{saved}</strong> uložených položek. Kanál i jeho data zmizí z knihovny,
                znalostí i exportů.
              </p>
              <div className="notice notice-danger" style={{ display: "block" }}>
                Před smazáním se vytvoří ověřená záloha databáze do složky <span className="mono">backups/</span>.
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(event) => setAck(event.target.checked)}
                  disabled={busy}
                  style={{ marginTop: 3, width: 18, height: 18 }}
                />
                <span>Rozumím, že se data nevratně smažou.</span>
              </label>
              {error ? (
                <div className="notice notice-danger" role="alert">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="dialog-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                Zrušit
              </button>
              <button type="button" className="btn btn-danger" onClick={remove} disabled={!ack || busy}>
                <Icon name="close" size={14} /> {busy ? "Mažu…" : "Smazat navždy"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
