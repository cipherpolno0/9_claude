import type { Metadata } from "next";

import {
  WorkspaceBrand,
  WorkspaceNav,
} from "@/components/workspace/workspace-nav";
import { WorkspaceTopbar } from "@/components/workspace/workspace-topbar";

export const metadata: Metadata = {
  title: { default: "พื้นที่ทำงาน", template: "%s | พื้นที่ทำงาน" },
};

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1">
      {/* แถบข้างจอใหญ่ */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-muted lg:flex">
        <WorkspaceBrand />
        <div className="flex-1 overflow-y-auto">
          <WorkspaceNav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceTopbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
