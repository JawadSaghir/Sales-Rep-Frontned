import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { getAlerts } from "@/lib/admin/data";

// The bundle's own admin shell, kept as written — the radial gradients are load
// bearing, not decoration: Sidebar is translucent with backdropFilter: blur(),
// so it has nothing to blur without them.
//
// metadata is added here because the bundle's admin title lived in its
// app/layout.tsx, which we do not land (ours is the rep app's root layout).
export const metadata = {
  title: "ISTV AI Mock Calls — Admin",
  description: "Track rep performance, review calls, assign scenarios.",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Sequential, not Promise.all: the guard must settle before anything reads
  // admin-only data, or a rep's 403 on the roster surfaces as an error page
  // instead of the redirect they should get.
  const session = await requireAdmin();
  const alerts = await getAlerts();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "#f6f7f8",
        backgroundImage:
          "radial-gradient(700px 420px at -8% 2%, rgba(217,56,42,.20), transparent 70%), radial-gradient(520px 380px at 10% 98%, rgba(20,22,26,.32), transparent 72%)",
      }}
    >
      <Sidebar user={session} alertCount={alerts.length} />
      <div style={{ flex: 1, minWidth: 0, padding: "26px 30px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        {children}
      </div>
    </div>
  );
}
