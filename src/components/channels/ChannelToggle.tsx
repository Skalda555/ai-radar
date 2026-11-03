"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function ChannelToggle({
  channelId,
  active,
}: {
  channelId: string;
  active: boolean;
}) {
  const [isActive, setIsActive] = useState(active);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}/active`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !isActive }),
      });
      const payload = (await response.json()) as { ok?: boolean; active?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setIsActive(Boolean(payload.active));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Změna stavu selhala.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-sm"
        onClick={toggle}
        disabled={pending}
        title={isActive ? "Pozastavit sledování" : "Reaktivovat sledování"}
      >
        <Icon name={isActive ? "pause" : "play"} size={13} />
        {pending ? "Měním…" : isActive ? "Pozastavit" : "Reaktivovat"}
      </button>
      {error ? (
        <span className="tiny" style={{ color: "#E46B6B" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
