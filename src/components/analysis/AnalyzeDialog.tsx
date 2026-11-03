"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export type AnalyzeDialogProps = {
  videoId: string;
  videoTitle: string;
  model: string;
  geminiKey: boolean;
  hasAnalysis: boolean;
  activeJobId: string | null;
  unknownJobId: string | null;
  defaultMode: "STATIC" | "AGENTIC";
};

type Phase = "idle" | "confirm" | "sending" | "error";

export function AnalyzeDialog(props: AnalyzeDialogProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"STATIC" | "AGENTIC">(props.defaultMode);
  const [allowReanalyze, setAllowReanalyze] = useState(false);
  const [ackUnknown, setAckUnknown] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase !== "sending") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, phase]);

  const blocked = !props.geminiKey;

  async function submit() {
    setPhase("sending");
    setError(null);
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(props.videoId)}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          mode,
          allowReanalyze: allowReanalyze || ackUnknown || props.hasAnalysis,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        message?: string;
      };
      if (!response.ok || !payload.ok) {
        if (payload.code === "UNKNOWN_PREVIOUS") {
          // Neodesíláme potichu: uživatel musí vědomě potvrdit riziko druhého placeného požadavku.
          setAckUnknown(true);
          setPhase("idle");
          setError(null);
          return;
        }
        setPhase("error");
        setError({ message: payload.error ?? `HTTP ${response.status}`, code: payload.code });
        if (payload.code === "ANALYSIS_EXISTS") setAllowReanalyze(true);
        return;
      }
      setOpen(false);
      setPhase("idle");
      router.refresh();
    } catch (caught) {
      setPhase("error");
      setError({ message: caught instanceof Error ? caught.message : "Požadavek selhal." });
    }
  }

  const modeHint =
    mode === "AGENTIC"
      ? "Background execution: úloha běží na serveru Google a stav se čte přes GET."
      : "Jeden synchronní požadavek. Vhodné pro kratší videa a jednoduché shrnutí.";

  return (
    <>
      <button
        type="button"
        className={props.hasAnalysis ? "btn" : "btn btn-primary"}
        onClick={() => setOpen(true)}
        disabled={Boolean(props.activeJobId)}
        title={props.activeJobId ? "Analýza už běží" : undefined}
      >
        <Icon name="spark" size={16} />
        {props.activeJobId ? "Analýza běží" : props.hasAnalysis ? "Analyzovat znovu" : "Analyzovat pomocí AI"}
      </button>

      {open ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && phase !== "sending") setOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="analyze-title">
            <div className="dialog-head">
              <div>
                <div className="eyebrow">Analýza videa</div>
                <h2 id="analyze-title">Analýza videa pomocí Gemini</h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                disabled={phase === "sending"}
                aria-label="Zavřít"
                style={{ minHeight: 40, padding: "6px 9px" }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="dialog-body" style={{ display: "grid", gap: 14 }}>
              <div className="panel" style={{ padding: 14 }}>
                <div className="tiny muted">Video</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{props.videoTitle}</div>
                <div className="tiny muted mono" style={{ marginTop: 4 }}>
                  {props.videoId}
                </div>
              </div>

              <div className="dialog-grid">
                <div>
                  <span className="field-label">Model</span>
                  <div className="input mono" style={{ display: "flex", alignItems: "center" }}>
                    {props.model}
                  </div>
                </div>
                <div>
                  <span className="field-label">Režim</span>
                  <select
                    className="select"
                    value={mode}
                    onChange={(event) => setMode(event.target.value === "STATIC" ? "STATIC" : "AGENTIC")}
                    disabled={phase === "sending"}
                  >
                    <option value="AGENTIC">AGENTIC — background</option>
                    <option value="STATIC">STATIC — synchronní</option>
                  </select>
                </div>
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>
                {modeHint}
              </p>


              {props.hasAnalysis ? (
                <div className="notice notice-danger" style={{ display: "block" }}>
                  Analýza už existuje. Nové spuštění ji nahradí a pošle další požadavek.
                </div>
              ) : null}

              {props.unknownJobId && !ackUnknown ? (
                <div className="notice notice-danger" style={{ display: "block" }}>
                  Poslední pokus skončil stavem <strong>UNKNOWN</strong>. Nevíme, zda Google úlohu
                  přijal. Opakování může znamenat druhý placený požadavek na totéž video.
                </div>
              ) : null}

              {ackUnknown ? (
                <div className="notice notice-danger" style={{ display: "block" }}>
                  Předchozí pokus zůstal ve stavu <strong>UNKNOWN</strong>. Tlačítko níže odešle{" "}
                  <strong>nový placený požadavek</strong>, i když Google mohl ten původní přijmout.
                  Pokud chceš nejdřív zkusit uloženou odpověď, použij „Obnovit uloženou odpověď".
                </div>
              ) : null}

              {blocked ? (
                <div className="notice notice-danger" style={{ display: "block" }}>
                  <strong>Gemini API není nakonfigurované.</strong> Doplň <span className="mono">GEMINI_API_KEY</span>{" "}
                  do <span className="mono">.env.local</span> a restartuj aplikaci. Bez klíče se analýza
                  neodešle.
                </div>
              ) : null}


              {error ? (
                <div className="notice notice-danger" role="alert" style={{ display: "block" }}>
                  <strong>{error.message}</strong>
                  {error.code === "NO_API_KEY" ? (
                    <div className="tiny" style={{ marginTop: 4 }}>
                      Klíč se nastavuje v souboru <span className="mono">.env.local</span> v kořeni projektu.
                      Aplikace ho nikdy nezobrazuje.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="dialog-foot">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                disabled={phase === "sending"}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submit}
                disabled={blocked || phase === "sending"}
              >
                <Icon name={phase === "sending" ? "sync" : "spark"} size={16} />
                {phase === "sending" ? "Odesílám…" : ackUnknown ? "Přesto odeslat" : "Odeslat analytický požadavek"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
