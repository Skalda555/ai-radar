"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Clipboard API exists only in a secure context, so plain HTTP on a LAN falls
 * back to the legacy textarea trick.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // permission denied or insecure context: try the fallback below
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

type CopyButtonProps = {
  text: string;
  label?: string;
  title?: string;
  className?: string;
  iconSize?: number;
  /** Icon-only button (for dense rows); the label stays in title/aria-label. */
  iconOnly?: boolean;
};

export function CopyButton({
  text,
  label = "Kopírovat",
  title,
  className = "btn btn-sm",
  iconSize = 12,
  iconOnly = false,
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    const copied = await writeToClipboard(text);
    setState(copied ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  const description =
    state === "copied"
      ? "Zkopírováno do schránky"
      : state === "failed"
        ? "Kopírování do schránky selhalo"
        : (title ?? "Kopírovat do schránky");

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      title={description}
      aria-label={iconOnly ? description : undefined}
      aria-live="polite"
    >
      <Icon name={state === "copied" ? "check" : "copy"} size={iconSize} />
      {iconOnly ? null : (
        <span>{state === "copied" ? "Zkopírováno" : state === "failed" ? "Nelze kopírovat" : label}</span>
      )}
    </button>
  );
}
