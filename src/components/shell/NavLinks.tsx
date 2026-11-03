"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../ui/Icon";
import type { NavGroup } from "./nav";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({
  groups,
  onNavigate,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Hlavní navigace" style={{ display: "grid", gap: "18px" }}>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="nav-group-label">{group.label}</div>
          <div style={{ display: "grid", gap: "2px" }}>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-link"
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <span className="nav-icon">
                    <Icon name={item.icon} />
                  </span>
                  <span>{item.label}</span>
                  {typeof item.count === "number" && item.count > 0 ? (
                    <span className="nav-count">{item.count}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
