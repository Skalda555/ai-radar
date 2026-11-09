/**
 * Tab ids are shared by the client component and the server page, so they live
 * in a plain module: a value exported from a `"use client"` file cannot be
 * called on the server.
 */
export const TAB_IDS = [
  "summary",
  "points",
  "tips",
  "workflows",
  "tools",
  "prompts",
  "sources",
] as const;

export type TabId = (typeof TAB_IDS)[number];

/** Lets the page open a specific tab through `?tab=` and keeps links working. */
export function isTabId(value: string | undefined): value is TabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value);
}
