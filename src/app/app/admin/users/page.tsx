import type { Metadata } from "next";

import { requireAccountManager } from "@/lib/auth/guards";
import type { OrgUnit } from "@/lib/org-units";
import { createClient } from "@/lib/supabase/server";

import { UsersManager, type AccountRow, type RequestRow, type RoleOption } from "./users-manager";

export const metadata: Metadata = { title: "บัญชีผู้ใช้" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await requireAccountManager();
  const supabase = await createClient();

  const [requestsRes, accountsRes, rolesRes, unitsRes] = await Promise.all([
    supabase
      .from("account_requests")
      .select(
        "id, kind, position_text, requested_role_key, org_unit_id, letter_path, note, created_at, " +
          "profiles!account_requests_user_id_fkey(id, title_prefix, first_name, monastic_name, last_name, email, phone), " +
          "org_units(name), roles(name)",
      )
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("profiles")
      .select(
        "id, title_prefix, first_name, monastic_name, last_name, email, phone, status, status_reason, last_seen_at, " +
          "user_roles!user_roles_user_id_fkey(id, role_key, org_unit_id, starts_on, ends_on, roles(name), org_units(name))",
      )
      .in("status", ["active", "suspended"])
      .order("first_name")
      .limit(1000),
    supabase.from("roles").select("key, name, requires_org_unit").order("sort_order"),
    supabase
      .from("org_units")
      .select("id, parent_id, level, sect, name, code, is_active")
      .eq("is_active", true)
      .order("code")
      .limit(10000),
  ]);

  const error = requestsRes.error ?? accountsRes.error ?? rolesRes.error ?? unitsRes.error;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">บัญชีผู้ใช้</h1>
      <p className="mt-1 text-muted-foreground">
        {ctx.isAdmin
          ? "พิจารณาคำขอบัญชี กำหนดบทบาท ระงับและเปิดใช้บัญชีของทุกหน่วย"
          : "พิจารณาคำขอบัญชีและดูแลบัญชีของหน่วยใต้สังกัดของท่าน"}
      </p>
      {error ? (
        <p role="alert" className="mt-6 rounded-md border border-destructive p-3 font-medium text-destructive">
          อ่านข้อมูลไม่ได้: {error.message}
        </p>
      ) : (
        <UsersManager
          isAdmin={ctx.isAdmin}
          currentUserId={ctx.user.id}
          requests={(requestsRes.data ?? []) as unknown as RequestRow[]}
          accounts={(accountsRes.data ?? []) as unknown as AccountRow[]}
          roles={(rolesRes.data ?? []) as RoleOption[]}
          units={(unitsRes.data ?? []) as OrgUnit[]}
        />
      )}
    </section>
  );
}
