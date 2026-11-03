import type { IconName } from "../ui/Icon";
import type { ShellData } from "../../lib/queries/shell";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  count?: number;
  countLabel?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export function buildNav(data: ShellData): NavGroup[] {
  return [
    {
      label: "Pracovní prostor",
      items: [
        { href: "/", label: "Přehled", icon: "overview" },
        { href: "/videa", label: "Videa", icon: "videos", count: data.videoCount },
        { href: "/na-pozdeji", label: "Na později", icon: "saved", count: data.savedCount },
        {
          href: "/kanaly",
          label: "Sledované kanály",
          icon: "channels",
          count: data.channelTotal,
        },
        {
          href: "/zpracovani",
          label: "Zpracování",
          icon: "processing",
          count: data.activeJobs,
        },
        {
          href: "/znalosti",
          label: "Knihovna znalostí",
          icon: "knowledge",
          count: data.knowledgeCount,
        },
        {
          href: "/databaze",
          label: "Databáze znalostí",
          icon: "database",
          count: data.curatedCount,
        },
      ],
    },
    {
      label: "Nastavení",
      items: [
        { href: "/nastaveni", label: "Nastavení", icon: "settings" },
        { href: "/api-spotreba", label: "API a spotřeba", icon: "usage" },
      ],
    },
  ];
}
