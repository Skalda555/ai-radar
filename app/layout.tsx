import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Radar — méně šumu, více podstaty",
    template: "%s · AI Radar",
  },
  description:
    "Osobní radar AI novinek z YouTube: sledované kanály, česká shrnutí, podložené poznatky a praktické postupy.",
  applicationName: "AI Radar",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
