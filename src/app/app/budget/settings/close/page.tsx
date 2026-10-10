import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InfoText } from "@/components/form";
import { requireMenu } from "@/lib/auth/guards";
import { baht, sumMoney } from "@/lib/budget";
import { fetchCloseCandidates, fetchClosingSummary, fetchFiscalYears } from "@/lib/budget-server";
import { createClient } from "@/lib/supabase/server";
import { thaiDateTime } from "@/lib/thai";

import { CloseYearForm } from "./close-form";

export const metadata: Metadata = { title: "ปิดสิ้นปีงบประมาณ" };
export const dynamic = "force-dynamic";

/** ผู้ดูแลระบบ: ตรวจก่อนปิดสิ้นปี เลือกคำขอที่ยกยอดผูกพันไปปีถัดไป แล้วยืนยัน / หลังปิดแสดงสรุปยอด */
export default async function CloseYearPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireMenu("/app/budget");
  if (!ctx.isAdmin) redirect("/app/budget");
  const search = await searchParams;
  const years = await fetchFiscalYears();
  const year = years.find((y) => String(y.year_be) === String(search.year)) ?? null;
  const next = year ? years.find((y) => y.year_be === year.year_be + 1) ?? null : null;

  let body: React.ReactNode;
  if (!year) {
    body = <p className="mt-6 rounded-xl border bg-card p-5">ไม่พบปีงบประมาณ</p>;
  } else if (year.year_end_closed_at) {
    const rows = await fetchClosingSummary(year.id);
    body = (
      <div className="mt-6 flex flex-col gap-3" data-testid="closing-summary">
        {typeof search.saved === "string" ? <InfoText>{search.saved}</InfoText> : null}
        <p>
          ปิดสิ้นปีเมื่อ {thaiDateTime(year.year_end_closed_at)}
          {year.year_end_note ? ` · หมายเหตุ: ${year.year_end_note}` : ""} (เปิดปีนี้อีกไม่ได้)
        </p>
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <caption className="sr-only">สรุปยอดปิดสิ้นปีรายหน่วย</caption>
            <thead className="bg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2">หน่วย</th>
                <th scope="col" className="px-3 py-2 text-right">ได้รับ</th>
                <th scope="col" className="px-3 py-2 text-right">จัดสรรต่อ</th>
                <th scope="col" className="px-3 py-2 text-right">ผูกพัน</th>
                <th scope="col" className="px-3 py-2 text-right">เบิกจ่าย</th>
                <th scope="col" className="px-3 py-2 text-right">คืนเงิน</th>
                <th scope="col" className="px-3 py-2 text-right">ยกไปปีถัดไป</th>
                <th scope="col" className="px-3 py-2 text-right">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.org_unit_id} className="border-t" data-testid="closing-row">
                  <td className="px-3 py-2">{r.unit_name}</td>
                  {[r.received, r.allocated, r.committed, r.disbursed, r.released, r.carried, r.remaining].map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {baht(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">ยอดของแต่ละหน่วยเป็นมุมมองของหน่วยนั้น (หน่วยเหนือนับยอดที่จัดสรรลงมาเป็นจัดสรรต่อ) จึงไม่รวมกันเป็นยอดทั้งระบบ</p>
      </div>
    );
  } else {
    const supabase = await createClient();
    const [candidates, uses, transfers] = await Promise.all([
      fetchCloseCandidates(year.id),
      supabase.from("budget_use_requests").select("id", { count: "exact", head: true }).eq("fiscal_year_id", year.id).in("status", ["pending", "returned"]),
      supabase.from("budget_transfers").select("id", { count: "exact", head: true }).eq("fiscal_year_id", year.id).in("status", ["pending", "returned"]),
    ]);
    const blockers = [
      uses.count ? `คำขอใช้งบที่รอพิจารณาหรือถูกส่งกลับ ${uses.count} รายการ` : null,
      transfers.count ? `คำขอโอนที่รอพิจารณาหรือถูกส่งกลับ ${transfers.count} รายการ` : null,
    ].filter(Boolean) as string[];
    body = (
      <div className="mt-6 flex flex-col gap-4">
        <ul className="list-disc pl-6 text-muted-foreground">
          <li>ปิดแล้วปีนี้ถูกล็อกถาวร แก้ไข จัดสรร โอน เบิกจ่ายไม่ได้ และเปิดอีกไม่ได้</li>
          <li>คำขอที่ติ๊ก: ยกยอดค้างเบิกไปปีงบประมาณ {year.year_be + 1} ระบบสร้างรายการ &quot;โครงการเดิม (กันเงินเหลื่อมปี {year.year_be})&quot; ให้หน่วยที่ใช้เงิน แล้วเบิกต่อได้ทันที</li>
          <li>คำขอที่ไม่ได้ติ๊ก: ระบบคืนเงินเหลือจ่ายเข้ารายการและปิดคำขอให้อัตโนมัติ</li>
          <li>ระบบเก็บสรุปยอดคงเหลือรายหน่วยรายหมวดไว้ดูภายหลัง</li>
        </ul>
        {blockers.length ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4" data-testid="close-blockers">
            ยังปิดปีไม่ได้: {blockers.join(" · ")} (ต้องพิจารณาหรือยกเลิกก่อน)
          </p>
        ) : null}
        <p data-testid="next-year">
          ปีถัดไป:{" "}
          {next ? `${next.year_be} (${next.status === "open" ? "เปิด" : "ปิด"})` : `ยังไม่มีปีงบประมาณ ${year.year_be + 1} ในระบบ (ยกยอดไม่ได้ เพิ่มปีที่หน้าตั้งค่าก่อน)`}
        </p>
        <CloseYearForm
          yearId={year.id}
          yearBe={year.year_be}
          canCarry={Boolean(next && next.status === "open" && !next.year_end_closed_at)}
          blocked={blockers.length > 0}
          candidates={candidates.map((c) => ({ ...c, outstanding: Number(c.outstanding), committed: Number(c.committed), disbursed: Number(c.disbursed) }))}
          totalOutstanding={sumMoney(candidates.map((c) => c.outstanding))}
        />
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/budget/settings" className="text-primary underline underline-offset-4">
          ← ตั้งค่างบประมาณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ปิดสิ้นปีงบประมาณ {year?.year_be ?? ""}</h1>
      {body}
    </section>
  );
}
