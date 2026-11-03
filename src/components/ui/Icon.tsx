import type { SVGProps } from "react";

export type IconName =
  | "overview"
  | "videos"
  | "saved"
  | "channels"
  | "processing"
  | "knowledge"
  | "settings"
  | "usage"
  | "search"
  | "external"
  | "plus"
  | "sync"
  | "pause"
  | "play"
  | "check"
  | "close"
  | "menu"
  | "chevronLeft"
  | "chevronRight"
  | "copy"
  | "alert"
  | "spark"
  | "clock"
  | "book"
  | "upload"
  | "download"
  | "arrowRight"
  | "volume"
  | "filter"
  | "database"
  | "radar";

const PATHS: Record<IconName, string> = {
  overview: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  videos: "M4 5h16v14H4zM10 9l5 3-5 3V9z",
  saved: "M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z",
  channels: "M4 9a3 3 0 1 0 0 6M20 9a3 3 0 1 1 0 6M8 12h8M12 8v8",
  processing: "M3 12h4l3-7 4 14 3-7h4",
  knowledge: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5zM4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6",
  usage: "M12 4a8 8 0 1 0 8 8M12 12l5-4",
  search: "M10.5 4a6.5 6.5 0 1 0 4.1 11.6L20 21l1-1-5.4-5.4A6.5 6.5 0 0 0 10.5 4z",
  external: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  plus: "M12 5v14M5 12h14",
  sync: "M20 11a8 8 0 0 0-14.3-4.9L4 8M4 5v3h3M4 13a8 8 0 0 0 14.3 4.9L20 16M20 19v-3h-3",
  pause: "M9 5v14M15 5v14",
  play: "M8 5l11 7-11 7V5z",
  check: "M4 12.5l5 5L20 6.5",
  close: "M6 6l12 12M18 6L6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  chevronLeft: "M15 5l-7 7 7 7",
  chevronRight: "M9 5l7 7-7 7",
  copy: "M9 9h10v12H9zM5 15V3h10",
  alert: "M12 3l9 17H3L12 3zM12 9v5M12 17v.5",
  spark: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z",
  clock: "M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8zM12 8v4.5l3 2",
  book: "M5 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H5V4zM19 4h-2a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h2V4z",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  download: "M12 4v12M7 11l5 5 5-5M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1",
  arrowRight: "M4 12h15M14 6l6 6-6 6",
  volume: "M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12",
  filter: "M4 5h16l-6.2 7.3v6.4L10.2 21v-8.7L4 5z",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  radar: "M12 12L4 8M12 12l8-4M12 12v9M4 8a9 9 0 0 1 16 0",
};

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
