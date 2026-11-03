export function nowIso(): string {
  return new Date().toISOString();
}

export function daysSince(iso: string, now = Date.now()): number | null {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (now - ts) / 86_400_000);
}

/** Czech relative time used in the status bar and cards. */
export function relativeTimeCs(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "zatím nikdy";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "neznámé datum";
  const diffMs = now - ts;
  if (diffMs < 0) return "právě teď";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "právě teď";
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `před ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `před ${months} měs.`;
  return `před ${Math.floor(months / 12)} r.`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "Europe/Prague",
});

export function formatDateCs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return DATE_FORMAT.format(new Date(ts));
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Prague",
});

export function formatDateTimeCs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return DATE_TIME_FORMAT.format(new Date(ts));
}
