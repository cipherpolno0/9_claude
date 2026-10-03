import type { Metadata } from "next";
import Link from "next/link";

import { REQUESTABLE_ROLES } from "@/lib/auth/config";
import type { OrgUnit } from "@/lib/org-units";
import { getSupabaseEnv } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "ขอบัญชีผู้ใช้" };
export const dynamic = "force-dynamic";

export default async function RequestAccountPage() {
  let units: OrgUnit[] = [];
  let roles: { key: string; name: string; requires_org_unit: boolean }[] = [];
  let ready = getSupabaseEnv().missing.length === 0;

  if (ready) {
    const supabase = await createClient();
    const [unitsRes, rolesRes] = await Promise.all([
      supabase
        .from("org_units")
        .select("id, parent_id, level, sect, name, code, is_active")
        .eq("is_active", true)
        .order("code")
        .limit(10000),
      supabase.from("roles").select("key, name, requires_org_unit").order("sort_order"),
    ]);
    units = (unitsRes.data as OrgUnit[] | null) ?? [];
    roles = (rolesRes.data ?? []).filter((r) => (REQUESTABLE_ROLES as readonly string[]).includes(r.key));
    ready = !unitsRes.error && !rolesRes.error;
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ขอบัญชีผู้ใช้</h1>
      <p className="mt-1 text-muted-foreground">
        สำหรับผู้ปฏิบัติงานของคณะสงฆ์และฝ่ายการศึกษา คำขอต้องได้รับอนุมัติจากผู้ดูแลระบบหรือหน่วยเหนือก่อนจึงใช้งานได้
      </p>
      <div className="mt-6 rounded-xl border bg-card p-5">
        {ready ? (
          <RequestForm units={units} roles={roles} />
        ) : (
          <p className="font-medium text-destructive">ขณะนี้ยังรับคำขอไม่ได้ เพราะระบบยังไม่ได้เชื่อมต่อฐานข้อมูล</p>
        )}
      </div>
      <p className="mt-4">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
          เข้าสู่ระบบ
        </Link>
      </p>
    </section>
  );
}
