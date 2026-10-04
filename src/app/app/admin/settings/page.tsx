import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

import { fetchPositionTypes } from "@/lib/persons-server";
import { fetchAcademicYears } from "@/lib/venues-server";

import { AcademicYearsManager } from "./academic-years-manager";
import { SettingsManager, type RoleRow, type SettingRow } from "./settings-manager";

export const metadata: Metadata = { title: "บทบาทและค่าตั้ง" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [roles, settings, positions, years] = await Promise.all([
    supabase.from("roles").select("key, name, requires_org_unit, mfa_required").order("sort_order"),
    supabase.from("app_settings").select("key, value_int, description").order("key"),
    fetchPositionTypes(),
    fetchAcademicYears(),
  ]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">บทบาทและค่าตั้ง</h1>
      <p className="mt-1 text-muted-foreground">กำหนดบทบาทที่บังคับยืนยันตัวตน 2 ขั้น เกณฑ์ด้านความปลอดภัยของบัญชี จำนวนตำแหน่งปกครองต่อหน่วย และปีการศึกษา</p>
      <SettingsManager
        roles={(roles.data ?? []) as RoleRow[]}
        settings={(settings.data ?? []) as SettingRow[]}
        positions={positions}
      />
      <AcademicYearsManager years={years} />
    </section>
  );
}
