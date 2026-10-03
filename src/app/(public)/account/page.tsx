import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { STATUS_LABEL } from "@/lib/auth/config";
import { logout } from "@/lib/auth/actions";
import { requireLogin } from "@/lib/auth/guards";
import { fullName } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ProfileForm, ReactivationForm } from "./account-forms";

export const metadata: Metadata = { title: "บัญชีของฉัน" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const ctx = await requireLogin();
  const supabase = await createClient();
  const profile = ctx.profile;

  const [{ data: roleUnits }, { data: pendingRequest }] = await Promise.all([
    supabase.rpc("my_org_units"),
    supabase.from("account_requests").select("id, kind, created_at").eq("user_id", ctx.user.id).eq("status", "pending").maybeSingle(),
  ]);
  const roles = (roleUnits as { role_name: string; org_unit_name: string | null }[] | null) ?? [];

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">บัญชีของฉัน</h1>
          <p className="mt-1 text-muted-foreground">{ctx.user.email}</p>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline">
            ออกจากระบบ
          </Button>
        </form>
      </div>

      {!profile ? (
        <div className="mt-6 rounded-xl border-2 border-dashed border-input bg-secondary p-5">
          <p className="text-lg font-semibold text-primary">ยังไม่พบข้อมูลผู้ใช้ของบัญชีนี้</p>
          <p className="mt-1">กรุณาติดต่อผู้ดูแลระบบ</p>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-xl border bg-card p-5">
            <p className="text-lg font-semibold">{fullName(profile)}</p>
            <p className="mt-1">
              สถานะบัญชี: <strong className="text-primary">{STATUS_LABEL[profile.status]}</strong>
            </p>

            {profile.status === "pending" ? (
              <p className="mt-2">คำขอบัญชีของท่านอยู่ระหว่างรอผู้ดูแลระบบหรือหน่วยเหนือพิจารณา เมื่ออนุมัติแล้วจึงเข้าพื้นที่ทำงานได้</p>
            ) : null}
            {profile.status === "rejected" ? (
              <p className="mt-2">
                คำขอบัญชีไม่ได้รับอนุมัติ{profile.status_reason ? ` เหตุผล: ${profile.status_reason}` : ""}
              </p>
            ) : null}
            {profile.status === "suspended" ? (
              <div className="mt-2 space-y-3">
                <p>บัญชีถูกระงับ{profile.status_reason ? ` เหตุผล: ${profile.status_reason}` : ""}</p>
                {pendingRequest ? (
                  <p className="font-medium text-primary">ท่านส่งคำขอเปิดใช้บัญชีแล้ว กรุณารอการพิจารณา</p>
                ) : (
                  <ReactivationForm />
                )}
              </div>
            ) : null}
            {profile.status === "active" ? (
              <div className="mt-3 space-y-3">
                {roles.length > 0 ? (
                  <ul className="list-disc pl-6">
                    {roles.map((r, i) => (
                      <li key={i}>
                        {r.role_name}
                        {r.org_unit_name ? ` · ${r.org_unit_name}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">ยังไม่มีบทบาท</p>
                )}
                {!ctx.mfaSatisfied ? (
                  <p className="font-medium text-destructive">
                    บทบาทของท่านต้องยืนยันตัวตน 2 ขั้นก่อนเข้าพื้นที่ทำงาน
                  </p>
                ) : null}
                {ctx.passwordExpired ? (
                  <p className="font-medium text-destructive">รหัสผ่านครบอายุแล้ว ต้องเปลี่ยนก่อนเข้าพื้นที่ทำงาน</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href="/app">เข้าพื้นที่ทำงาน</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/account/password">เปลี่ยนรหัสผ่าน</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/account/mfa">ยืนยันตัวตน 2 ขั้น</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {profile.status === "active" ? (
            <div className="mt-6 rounded-xl border bg-card p-5">
              <h2 className="text-xl font-bold text-primary">ข้อมูลส่วนตัว</h2>
              <div className="mt-3">
                <ProfileForm profile={profile} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
