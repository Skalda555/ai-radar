"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export type SettingsValues = {
  analysisDailyLimit: number;
  syncIntervalHours: number;
  defaultAnalysisMode: "STATIC" | "AGENTIC";
  interestProfile: string[];
};

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [values, setValues] = useState<SettingsValues>(initial);
  const [profileText, setProfileText] = useState(initial.interestProfile.join("\n"));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          interestProfile: profileText.split("\n").map((line) => line.trim()).filter(Boolean),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; preferences?: SettingsValues };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      if (payload.preferences) {
        setValues(payload.preferences);
        setProfileText(payload.preferences.interestProfile.join("\n"));
      }
      setState("saved");
      setMessage("Nastavení uloženo.");
      router.refresh();
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Uložení selhalo.");
    }
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 16 }}>
      <div className="settings-grid">
        <div>
          <label className="field-label" htmlFor="daily-limit">
            Denní limit nových analýz
          </label>
          <input
            id="daily-limit"
            className="input"
            type="number"
            min={0}
            max={200}
            value={values.analysisDailyLimit}
            onChange={(event) =>
              setValues((current) => ({ ...current, analysisDailyLimit: Number(event.target.value) }))
            }
          />
          <p className="tiny muted" style={{ marginTop: 5 }}>
            0 = bez limitu. Počítají se jen skutečně odeslané analytické POST požadavky.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="sync-interval">
            Frekvence RSS kontroly
          </label>
          <select
            id="sync-interval"
            className="select"
            value={values.syncIntervalHours}
            onChange={(event) =>
              setValues((current) => ({ ...current, syncIntervalHours: Number(event.target.value) }))
            }
          >
            <option value={0}>Vypnuto (ruční synchronizace)</option>
            <option value={3}>Každé 3 hodiny</option>
            <option value={6}>Každých 6 hodin</option>
            <option value={12}>Každých 12 hodin</option>
            <option value={24}>Jednou denně</option>
          </select>
          <p className="tiny muted" style={{ marginTop: 5 }}>
            Jen uložená preference pro plánovač. Aplikace sama na pozadí nic nespouští.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="default-mode">
            Výchozí režim analýzy
          </label>
          <select
            id="default-mode"
            className="select"
            value={values.defaultAnalysisMode}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                defaultAnalysisMode: event.target.value === "STATIC" ? "STATIC" : "AGENTIC",
              }))
            }
          >
            <option value="AGENTIC">AGENTIC — background, delší videa</option>
            <option value="STATIC">STATIC — synchronní, krátká videa</option>
          </select>
        </div>

        <div>
          <span className="field-label">Automatická AI analýza</span>
          <div
            className="input"
            style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-muted)" }}
            aria-disabled="true"
          >
            <Icon name="pause" size={14} /> Trvale vypnuto
          </div>
          <p className="tiny muted" style={{ marginTop: 5 }}>
            Automatická analýza by vytvářela neohlášené placené požadavky. Analýzu spouštíš jen ručně
            po potvrzení.
          </p>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="interest-profile">
          Profil zájmů (jeden řádek = jedna položka)
        </label>
        <textarea
          id="interest-profile"
          className="input"
          rows={8}
          value={profileText}
          onChange={(event) => setProfileText(event.target.value)}
          style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 13 }}
        />
        <p className="tiny muted" style={{ marginTop: 5 }}>
          Profil se vkládá do analytického zadání a ovlivňuje doporučení „Jak to mohu využít“.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={state === "saving"}>
          <Icon name="check" size={15} /> {state === "saving" ? "Ukládám…" : "Uložit nastavení"}
        </button>
        {message ? (
          <span className="tiny" style={{ color: state === "error" ? "#E46B6B" : "#8FE0BD" }} role="status">
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function BackupButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch("/api/backup", { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; path?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setState("done");
      setMessage(`Záloha vytvořena a ověřena: ${payload.path}`);
      router.refresh();
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Záloha selhala.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" className="btn" onClick={run} disabled={state === "running"} style={{ justifySelf: "start" }}>
        <Icon name="download" size={15} /> {state === "running" ? "Zálohuji…" : "Vytvořit zálohu databáze"}
      </button>
      {message ? (
        <span className="tiny" style={{ color: state === "error" ? "#E46B6B" : "#8FE0BD", wordBreak: "break-word" }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
