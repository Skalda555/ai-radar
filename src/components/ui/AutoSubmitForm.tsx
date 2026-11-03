"use client";

import { useRef } from "react";

/**
 * GET formulář, který se sám odešle při změně kteréhokoli <select>.
 * Bez JavaScriptu zůstává obyčejný formulář s tlačítkem.
 */
export function AutoSubmitForm({
  action,
  className,
  children,
  ariaLabel,
  style,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  style?: React.CSSProperties;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      className={className}
      style={style}
      role="search"
      aria-label={ariaLabel}
      onChange={(event) => {
        const target = event.target as HTMLElement;
        if (target.tagName === "SELECT") {
          formRef.current?.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
