import type { Metadata } from "next";
import Link from "next/link";

import { WorkspaceBrand, WorkspaceNav, type NavAccess } from "@/components/workspace/workspace-nav";
import { WorkspaceTopbar } from "@/components/workspace/workspace-topbar";
import { requireWorkspace } from "@/lib/auth/guards";
import { fullName } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "พื้นที่ทำงาน", template: "%s | พื้นที่ทำงาน" },
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  // เข้าได้เมื่อล็อกอิน บัญชีใช้งานได้ ยืนยัน 2 ขั้นแล้ว (ถ้าบทบาทบังคับ) และรหัสผ่านยังไม่ครบอายุ
  const ctx = await requireWorkspace();
  const access: NavAccess = {
    allowed: ctx.allMenus ? null : ctx.allowedMenus,
    showAdmin: ctx.isAccountManager,
  };
  const userName = ctx.profile ? fullName(ctx.profile) : (ctx.user.email ?? "");

  return (
    <div className="flex min-h-screen flex-1">
      {/* แถบข้างจอใหญ่ */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-muted lg:flex print:hidden">
        <WorkspaceBrand />
        <div className="flex-1 overflow-y-auto">
          <WorkspaceNav access={access} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceTopbar access={access} userName={userName} />
        {ctx.passwordWarn ? (
          <p role="status" className="border-b border-input bg-accent px-4 py-2 font-medium text-accent-foreground print:hidden">
            รหัสผ่านของท่านจะครบอายุในอีก {ctx.passwordDaysLeft} วัน{" "}
            <Link href="/account/password" className="underline underline-offset-4">
              เปลี่ยนรหัสผ่านตอนนี้
            </Link>
          </p>
        ) : null}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
