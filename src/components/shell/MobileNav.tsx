"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../ui/Icon";
import { NavLinks } from "./NavLinks";
import type { NavGroup } from "./nav";

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="mobile-bar">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 40, padding: "6px 9px" }}
          onClick={() => setOpen(true)}
          aria-label="Otevřít navigaci"
          aria-expanded={open}
        >
          <Icon name="menu" size={20} />
        </button>
        <Link href="/" className="brand" style={{ padding: 0, gap: 9 }}>
          <span className="brand-mark" style={{ width: 28, height: 28, borderRadius: 8 }}>
            <Icon name="radar" size={16} />
          </span>
          <span>
            <span className="brand-title" style={{ fontSize: 15 }}>
              AI Radar
            </span>
          </span>
        </Link>
      </div>

      {open ? (
        <>
          <button
            type="button"
            className="drawer-scrim"
            aria-label="Zavřít navigaci"
            onClick={() => setOpen(false)}
          />
          <div className="side-drawer" role="dialog" aria-modal="true" aria-label="Navigace">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Link href="/" className="brand" onClick={() => setOpen(false)}>
                <span className="brand-mark">
                  <Icon name="radar" size={18} />
                </span>
                <span>
                  <span className="brand-title">AI Radar</span>
                  <span className="brand-sub">méně šumu</span>
                </span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                aria-label="Zavřít"
                style={{ minHeight: 40, padding: "6px 9px" }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </>
      ) : null}
    </>
  );
}
