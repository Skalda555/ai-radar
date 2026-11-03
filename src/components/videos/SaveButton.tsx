"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function SaveButton({
  videoId,
  initialSaved,
  size = "sm",
  iconOnly = false,
}: {
  videoId: string;
  initialSaved: boolean;
  size?: "sm" | "md";
  iconOnly?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saved: !saved }),
      });
      const payload = (await response.json()) as { ok?: boolean; saved?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setSaved(Boolean(payload.saved));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Uložení selhalo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        className={
          iconOnly
            ? `btn btn-sm btn-icon ${saved ? "is-active" : ""}`
            : `btn ${saved ? "btn-primary" : ""} ${size === "sm" ? "btn-sm" : ""}`
        }
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={saved ? "Odebrat z Na později" : "Uložit na později"}
        title={saved ? "Odebrat z Na později" : "Uložit na později"}
      >
        <Icon name="saved" size={15} />
        {iconOnly ? null : pending ? "Ukládám…" : saved ? "Uloženo" : "Na později"}
      </button>
      {error ? (
        <span className="tiny" style={{ color: "#E46B6B" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
