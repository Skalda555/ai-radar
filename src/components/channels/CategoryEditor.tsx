"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

export function CategoryEditor({
  channelId,
  category,
  suggestions,
}: {
  channelId: string;
  category: string | null;
  suggestions: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(category ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const listId = `category-options-${channelId}`;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const trimmed = value.trim();
      const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}/category`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: trimmed ? trimmed : null }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {category ? (
          <span className="chip chip-accent">{category}</span>
        ) : (
          <span className="chip chip-neutral">bez kategorie</span>
        )}
        <button
          type="button"
          className="btn btn-sm btn-icon"
          onClick={() => {
            setValue(category ?? "");
            setEditing(true);
          }}
          aria-label="Upravit kategorii"
          title="Upravit kategorii"
        >
          <Icon name="settings" size={13} />
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        className="input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") setEditing(false);
        }}
        list={listId}
        maxLength={60}
        autoFocus
        aria-label="Kategorie kanálu"
        placeholder="AI modely…"
        style={{ height: 34, width: 180, fontSize: 13 }}
        disabled={saving}
      />
      <datalist id={listId}>
        {suggestions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <button
        type="button"
        className="btn btn-sm btn-icon"
        onClick={save}
        disabled={saving}
        aria-label="Uložit kategorii"
        title="Uložit"
      >
        <Icon name={saving ? "sync" : "check"} size={13} />
      </button>
      <button
        type="button"
        className="btn btn-sm btn-icon"
        onClick={() => setEditing(false)}
        disabled={saving}
        aria-label="Zrušit úpravu"
        title="Zrušit"
      >
        <Icon name="close" size={13} />
      </button>
      {error ? (
        <span className="tiny" style={{ color: "#E46B6B" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
