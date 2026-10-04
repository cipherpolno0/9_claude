import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { workspaceMenu } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

import { PermissionsManager, type MenuRow, type RoleRow } from "./permissions-manager";

export const metadata: Metadata = { title: "สิทธิ์ตามบทบาท" };
export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [roles, menus] = await Promise.all([
    supabase
      .from("roles")
      .select("key, name, requires_org_unit, personnel_view, personnel_edit")
      .order("sort_order"),
    supabase.from("role_menus").select("role_key, menu_href, enabled"),
  ]);

  // รายการเมนูมาจากที่เดียวกับแถบข้าง (src/lib/site.ts) ยกเว้นแดชบอร์ดซึ่งเห็นทุกคน
  const menuItems = workspaceMenu
    .flatMap((g) => g.items)
    .filter((m) => m.href !== "/app")
    .map((m) => ({ href: m.href, title: m.title }));

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">สิทธิ์ตามบทบาท</h1>
      <p className="mt-1 text-muted-foreground">
        กำหนดว่าแต่ละบทบาทใช้เมนูใดได้ และดูหรือแก้ไขทะเบียนบุคคลได้กว้างเพียงใด มีผลกับผู้ใช้ทุกคนที่มีบทบาทนั้นทันที
      </p>
      <PermissionsManager
        roles={(roles.data ?? []) as RoleRow[]}
        menus={(menus.data ?? []) as MenuRow[]}
        menuItems={menuItems}
      />
    </section>
  );
}
