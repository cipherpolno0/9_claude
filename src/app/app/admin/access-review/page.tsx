import type { Metadata } from "next";

import { requireAccountManager } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

import { ReviewManager, type ReviewRow, type Round } from "./review-manager";

export const metadata: Metadata = { title: "ทบทวนสิทธิ์ประจำปี" };
export const dynamic = "force-dynamic";

export default async function AccessReviewPage() {
  const ctx = await requireAccountManager();
  const supabase = await createClient();

  // ผู้ดูแลระบบเปิดหน้านี้: ระงับบัญชีที่เข้าเกณฑ์ และปิดรอบที่ครบกำหนด
  let maintenance: { suspended: number; rounds_closed: number } | null = null;
  if (ctx.isAdmin) {
    const { data } = await supabase.rpc("run_account_maintenance");
    maintenance = data as typeof maintenance;
  }

  const { data: rounds } = await supabase
    .from("access_review_rounds")
    .select("id, year_be, opened_at, due_on, closed_at")
    .order("opened_at", { ascending: false })
    .limit(10);
  const all = (rounds as Round[] | null) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const current = all.find((r) => !r.closed_at && r.due_on >= today) ?? null;

  let rows: ReviewRow[] = [];
  if (current) {
    const { data } = await supabase.rpc("access_review_list", { p_round_id: current.id });
    rows = (data as ReviewRow[] | null) ?? [];
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ทบทวนสิทธิ์ประจำปี</h1>
      <p className="mt-1 text-muted-foreground">
        ยืนยันรายชื่อบัญชีในหน่วยของท่านและหน่วยใต้สังกัดปีละครั้ง บัญชีที่ไม่ได้รับการยืนยันภายใน{" "}
        {ctx.settings.access_review_grace_days ?? 30} วัน หรือไม่เข้าใช้เกิน {ctx.settings.inactive_suspend_days ?? 180}{" "}
        วัน จะถูกระงับอัตโนมัติ และขอเปิดใช้ใหม่ได้
      </p>
      <ReviewManager
        isAdmin={ctx.isAdmin}
        current={current}
        history={all.filter((r) => r.id !== current?.id)}
        rows={rows}
        defaultYearBe={new Date().getFullYear() + 543}
        maintenance={maintenance}
      />
    </section>
  );
}
