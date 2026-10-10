import type { Metadata } from "next";
import Link from "next/link";

import {
  MONTH_SHORT,
  baht,
  compareMonthIndex,
  disbursedPercent,
  monthTarget,
  moneyTotals,
  ownBase,
  percentText,
  sumMoney,
  yearTargets,
} from "@/lib/budget";
import { fetchMonthly, fetchScopeLines, remindBudgetAlerts } from "@/lib/budget-server";
import { findWorkspaceMenu } from "@/lib/site";
import { cn } from "@/lib/utils";

import { UnitFilter } from "../personnel/unit-filter";
import { MonthlyChart, type MonthPoint } from "./monthly-chart";
import { YearSelect } from "./plan/year-select";
import { budgetQuery, loadBudgetScope } from "./scope";

const menu = findWorkspaceMenu("/app/budget");

export const metadata: Metadata = { title: menu.title };
export const dynamic = "force-dynamic";

/** แดชบอร์ดงบประมาณ: ยอดรวม กราฟเบิกจ่ายสะสมเทียบเป้า รายการที่เบิกจ่ายต่ำกว่าเป้า และเมนูของระบบ */
export default async function BudgetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx, years, year, units, unit } = await loadBudgetScope(search);
  // แจ้งเตือนงบเหลือน้อยและคำของบประมาณค้างพิจารณา (ฐานข้อมูลกันแจ้งซ้ำ)
  await remindBudgetAlerts();
  const sub = search.sub !== "0";
  const [lines, months] = year && unit ? await Promise.all([fetchScopeLines(year.id, unit.id, sub), fetchMonthly(year.id, unit.id, sub)]) : [[], []];
  const totals = moneyTotals(lines);
  const base = ownBase(totals);
  const targets = yearTargets(year);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const cmp = year ? compareMonthIndex(year, today) : -1;
  const shownUntil = Math.min(11, cmp + 1);
  const cumulative: number[] = [];
  for (const m of months) cumulative.push(Math.round(((cumulative.at(-1) ?? 0) + Number(m.disbursed)) * 100) / 100);
  const points: MonthPoint[] = months.map((m, i) => ({
    label: MONTH_SHORT[i],
    disbursed: Number(m.disbursed),
    cumulative: cumulative[i],
    actual: i <= shownUntil && base > 0 ? Math.round((cumulative[i] / base) * 10000) / 100 : null,
    target: targets ? monthTarget(targets, i) : null,
  }));
  const target = targets && cmp >= 0 ? monthTarget(targets, cmp) : null;
  const below =
    target === null
      ? []
      : lines
          .map((l) => ({ l, base: ownBase(l), percent: disbursedPercent(l) }))
          .filter((x) => x.base > 0 && (x.percent ?? 0) < target)
          .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0));
  const q = (extra: Record<string, string> = {}) => budgetQuery(year, unit, { ...(sub ? {} : { sub: "0" }), ...extra });

  const cards = [
    { href: "/app/budget/plan", title: "แผนงบประมาณและการจัดสรร", text: "ต้นไม้งบ แผนงาน > โครงการหรือกิจกรรม > หมวดรายจ่าย วงเงิน จัดสรร ผูกพัน เบิกจ่าย คงเหลือ" },
    { href: "/app/budget/uses", title: "ขอใช้งบและเบิกจ่าย", text: "ยื่นขอใช้งบ บันทึกเบิกจ่ายหลายงวด แนบใบเสร็จ คืนเงินเหลือจ่าย ทะเบียนคุมอยู่ที่หน้ารายการงบ" },
    { href: "/app/budget/reports", title: "รายงานงบประมาณ", text: "ตามแผนงาน ตามหน่วย ตามแหล่งเงิน รายไตรมาส และรายละเอียดการเบิกจ่าย พิมพ์และส่งออก Excel ได้" },
    { href: "/app/budget/transfers", title: "คำขอโอนเปลี่ยนแปลง", text: "โอนวงเงินระหว่างหมวดรายจ่ายของหน่วยเจ้าของงบ ผ่านการอนุมัติของเจ้าคณะของหน่วยนั้น" },
    ...(ctx.isAdmin
      ? [
          { href: "/app/budget/settings", title: "ตั้งค่างบประมาณ", text: "ปีงบประมาณ เป้าการเบิกจ่ายรายไตรมาส ปิดสิ้นปี แหล่งเงิน และหมวดรายจ่าย (ผู้ดูแลระบบ)" },
          { href: "/app/admin/budget-limits", title: "วงเงินอนุมัติ", text: "วงเงินที่เจ้าคณะแต่ละชั้นอนุมัติคำขอใช้งบได้ (ผู้ดูแลระบบ)" },
        ]
      : []),
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      {!ctx.canViewBudget ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3" data-testid="budget-denied">
          บทบาทของท่านยังไม่มีสิทธิ์ดูงบประมาณ (ผู้ดูแลระบบตั้งได้ที่หน้า สิทธิ์ตามบทบาท)
        </p>
      ) : !year || !unit ? (
        <p className="mt-4 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="budget-no-year">
          {years.length ? "ยังไม่มีหน่วยที่ท่านดูงบได้" : "ยังไม่มีปีงบประมาณในระบบ"}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4" data-testid="budget-dashboard">
          <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
            <YearSelect years={years} value={year.year_be} unitId={unit.id} />
            <UnitFilter units={units} value={unit.id} param="unit" allowClear={false} applyLabel="ดูแดชบอร์ดของหน่วยนี้" />
          </div>
          <div className="flex flex-wrap gap-2" data-testid="scope-toggle">
            <Link
              href={`/app/budget?${q({ sub: "" })}`}
              prefetch={false}
              aria-current={sub ? "true" : undefined}
              className={cn("rounded-md border px-3 py-1", sub ? "border-primary font-semibold" : "bg-card")}
            >
              รวมหน่วยใต้สังกัด
            </Link>
            <Link
              href={`/app/budget?${q({ sub: "0" })}`}
              prefetch={false}
              aria-current={!sub ? "true" : undefined}
              className={cn("rounded-md border px-3 py-1", !sub ? "border-primary font-semibold" : "bg-card")}
            >
              เฉพาะหน่วยนี้
            </Link>
            {year.year_end_closed_at ? <span className="self-center text-sm text-muted-foreground">ปีงบประมาณ {year.year_be} ปิดสิ้นปีแล้ว</span> : null}
          </div>

          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="dashboard-totals">
            {[
              { k: "วงเงิน", v: baht(totals.received), id: "received" },
              { k: sub ? "จัดสรรให้สำนัก/นอกสาย" : "จัดสรรแล้ว", v: baht(totals.allocated), id: "allocated" },
              { k: "ผูกพัน", v: baht(totals.committed), id: "committed" },
              { k: "เบิกจ่าย", v: baht(totals.disbursed), id: "disbursed" },
              { k: "คงเหลือ", v: baht(totals.remaining), id: "remaining" },
              { k: "ร้อยละการเบิกจ่าย", v: percentText(disbursedPercent(totals)), id: "percent" },
            ].map((t) => (
              <div key={t.id} className="rounded-xl border bg-card p-4" data-tile={t.id}>
                <dt className="text-sm text-muted-foreground">{t.k}</dt>
                <dd className="text-xl font-bold text-primary tabular-nums">{t.v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            ร้อยละการเบิกจ่าย = เบิกจ่าย ÷ วงเงินที่ใช้เอง ({baht(base)} บาท = วงเงิน - {sub ? "จัดสรรออกนอกสาย" : "จัดสรรแล้ว"})
            {sub ? " ยอดรวมหน่วยใต้สังกัดไม่นับเงินที่จัดสรรให้กันภายในสายซ้ำ" : ""}
          </p>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-bold text-primary">เบิกจ่ายสะสมรายเดือนเทียบเป้า</h2>
            <div className="mt-3">
              <MonthlyChart points={points} />
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-primary underline underline-offset-4">ดูเป็นตาราง</summary>
              <div className="relative mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm" data-testid="monthly-table">
                  <thead className="bg-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2">เดือน</th>
                      <th scope="col" className="px-3 py-2 text-right">ผูกพันสุทธิ</th>
                      <th scope="col" className="px-3 py-2 text-right">เบิกจ่าย</th>
                      <th scope="col" className="px-3 py-2 text-right">เบิกจ่ายสะสม</th>
                      <th scope="col" className="px-3 py-2 text-right">ร้อยละสะสม</th>
                      <th scope="col" className="px-3 py-2 text-right">เป้าสะสม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p, i) => (
                      <tr key={p.label} className="border-t">
                        <td className="px-3 py-1">{p.label}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{baht(months[i]?.committed)}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{baht(p.disbursed)}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{baht(p.cumulative)}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{percentText(p.actual)}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{percentText(p.target)}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-semibold">
                      <td className="px-3 py-1">รวม</td>
                      <td className="px-3 py-1 text-right tabular-nums">{baht(sumMoney(months.map((m) => m.committed)))}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{baht(sumMoney(months.map((m) => m.disbursed)))}</td>
                      <td colSpan={3} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-bold text-primary">รายการที่เบิกจ่ายต่ำกว่าเป้า</h2>
            {target === null ? (
              <p className="mt-2 text-muted-foreground" data-testid="below-target-none">
                {targets ? "ยังไม่ครบเดือนแรกของปีงบประมาณ จึงยังไม่เทียบเป้า" : "ยังไม่ได้ตั้งเป้าการเบิกจ่ายของปีนี้"}
              </p>
            ) : below.length === 0 ? (
              <p className="mt-2 text-muted-foreground" data-testid="below-target-none">
                ทุกรายการเบิกจ่ายถึงเป้าสะสม {percentText(target)} ณ สิ้นเดือน {MONTH_SHORT[cmp]}แล้ว
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  เทียบเป้าสะสม {percentText(target)} ณ สิ้นเดือน {MONTH_SHORT[cmp]} ({below.length.toLocaleString("th-TH")} รายการ)
                </p>
                <div className="relative mt-2 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left" data-testid="below-target">
                    <thead className="bg-secondary">
                      <tr>
                        <th scope="col" className="px-3 py-2">หน่วย</th>
                        <th scope="col" className="px-3 py-2">รายการ</th>
                        <th scope="col" className="px-3 py-2 text-right">วงเงินที่ใช้เอง</th>
                        <th scope="col" className="px-3 py-2 text-right">เบิกจ่าย</th>
                        <th scope="col" className="px-3 py-2 text-right">ร้อยละ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {below.slice(0, 50).map(({ l, base: b, percent }) => (
                        <tr key={`${l.org_unit_id}:${l.item_id}`} className="border-t align-top" data-testid="below-row">
                          <td className="px-3 py-2">{l.unit_name}</td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/app/budget/plan/items/${l.item_id}?${budgetQuery(year, { id: l.org_unit_id })}`}
                              prefetch={false}
                              className="text-primary underline underline-offset-4"
                            >
                              {l.program_name} &gt; {l.project_name} &gt; {l.item_label}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{baht(b)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{baht(l.disbursed)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{percentText(percent ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {below.length > 50 ? <p className="mt-2 text-sm text-muted-foreground">แสดง 50 รายการแรก ดูทั้งหมดที่รายงานตามแผนงาน</p> : null}
              </>
            )}
          </div>
        </div>
      )}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="budget-menu">
        {cards.map((c) => (
          <li key={c.href}>
            <Link href={c.href} prefetch={false} className="block h-full rounded-xl border bg-card p-4 hover:bg-secondary">
              <span className="text-lg font-bold text-primary">{c.title}</span>
              <span className="mt-1 block text-muted-foreground">{c.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
