import { AppShell } from "@/components/shell/AppShell";
import { getDb } from "@/lib/db/client";
import { getShellData } from "@/lib/queries/shell";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const data = getShellData(getDb());
  return <AppShell data={data}>{children}</AppShell>;
}
