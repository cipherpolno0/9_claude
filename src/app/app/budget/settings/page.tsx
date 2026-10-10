import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchBudgetOptions, fetchFiscalYears } from "@/lib/budget-server";

import { FiscalYearManager, OptionManager } from "./settings-manager";

export const metadata: Metadata = { title: "ตั้งค่างบประมาณ" };
export const dynamic = "force-dynamic";

/** ผู้ดูแลระบบ: ปีงบประมาณ แหล่งเงิน หมวดรายจ่าย */
export default async function BudgetSettingsPage() {
  const ctx = await requireMenu("/app/budget");
  if (!ctx.isAdmin) redirect("/app/budget");
  const [years, { sources, categories }] = await Promise.all([fetchFiscalYears(), fetchBudgetOptions()]);
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/budget" className="text-primary underline underline-offset-4">
          งบประมาณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ตั้งค่างบประมาณ</h1>
      <p className="mt-1 text-muted-foreground">
        ค่าตั้งต้นตามคำสั่งงาน: แหล่งเงิน 3 รายการ หมวดรายจ่าย 4 หมวด แก้ชื่อ เพิ่ม หรือปิดใช้งานได้ (ระบบไม่ลบ รายการเดิมที่ใช้อยู่ไม่เปลี่ยน)
      </p>
      <h2 className="mt-8 text-xl font-bold text-primary">ปีงบประมาณ</h2>
      <div className="mt-3">
        <FiscalYearManager years={years} />
      </div>
      <h2 className="mt-8 text-xl font-bold text-primary">แหล่งเงิน</h2>
      <div className="mt-3">
        <OptionManager table="sources" title="แหล่งเงิน" options={sources} />
      </div>
      <h2 className="mt-8 text-xl font-bold text-primary">หมวดรายจ่าย</h2>
      <div className="mt-3">
        <OptionManager table="categories" title="หมวดรายจ่าย" options={categories} />
      </div>
    </section>
  );
}
