import "server-only";

import {
  BUDGET_REPORT_LABEL,
  KIND_LABEL,
  QUARTER_LABEL,
  disbursedPercent,
  moneyTotals,
  ownBase,
  sumMoney,
  yearTargets,
  type BudgetReportKind,
  type FiscalYear,
  type MoneyTotals,
  type ScopeLine,
} from "@/lib/budget";
import { fetchDisbursementReport, fetchMonthly, fetchScopeLines, fetchUnitReport } from "@/lib/budget-server";
import type { ReportColumn, ReportTable } from "@/lib/reports";
import { thaiDate } from "@/lib/thai";

/**
 * รายงานงบประมาณ 5 แบบ สร้างเป็น ReportTable กลาง (ใช้ทั้งบนจอ หน้าพิมพ์ และ Excel)
 * ขอบเขต: หน่วยที่เลือก และหน่วยใต้สังกัดเมื่อ sub (ตัดการจัดสรรภายในขอบเขตออก ไม่นับซ้ำ)
 */

const money = (header: string, width = 16): ReportColumn => ({ header, width, align: "right", format: "money" });
const MONEY_COLS: ReportColumn[] = [money("วงเงิน"), money("จัดสรรออก"), money("ผูกพัน"), money("เบิกจ่าย"), money("คงเหลือ"),
  { header: "ร้อยละเบิกจ่าย", width: 12, align: "right", format: "percent" }];

const n2 = (v: number | string) => Math.round(Number(v ?? 0) * 100) / 100;
const pct = (t: MoneyTotals) => disbursedPercent(t) ?? "-";
const moneyCells = (t: MoneyTotals): (string | number)[] => [t.received, t.allocated, t.committed, t.disbursed, t.remaining, pct(t)];

export type BudgetReportScope = { year: FiscalYear; unit: { id: string; name: string }; sub: boolean };

function subtitleOf(s: BudgetReportScope) {
  return `${s.unit.name}${s.sub ? " (รวมหน่วยใต้สังกัด)" : " (เฉพาะหน่วยนี้)"} · ปีงบประมาณ ${s.year.year_be}`;
}

const NOTE_SCOPE =
  "วงเงิน = ยอดที่ได้รับ (ไม่นับเงินที่จัดสรรให้กันภายในขอบเขตซ้ำ) จัดสรรออก = จัดสรรให้สำนักหรือหน่วยนอกขอบเขต ร้อยละเบิกจ่าย = เบิกจ่าย ÷ (วงเงิน - จัดสรรออก)";

function planReport(s: BudgetReportScope, lines: ScopeLine[]): ReportTable {
  const rows: (string | number)[][] = [];
  const programs = new Map<string, ScopeLine[]>();
  for (const l of lines) programs.set(l.program_id, [...(programs.get(l.program_id) ?? []), l]);
  for (const [, pl] of programs) {
    const p = pl[0];
    rows.push([
      KIND_LABEL.program,
      `${p.program_code ? `${p.program_code} ` : ""}${p.program_name}${p.owner_unit_id !== s.unit.id ? ` (งบของ ${p.owner_unit_name})` : ""}`,
      ...moneyCells(moneyTotals(pl)),
    ]);
    const projects = new Map<string, ScopeLine[]>();
    for (const l of pl) projects.set(l.project_id, [...(projects.get(l.project_id) ?? []), l]);
    for (const [, jl] of projects) {
      rows.push([KIND_LABEL.project, `    ${jl[0].project_name}`, ...moneyCells(moneyTotals(jl))]);
      const items = new Map<string, ScopeLine[]>();
      for (const l of jl) items.set(l.item_id, [...(items.get(l.item_id) ?? []), l]);
      for (const [, il] of items) rows.push([KIND_LABEL.category, `        ${il[0].item_label}`, ...moneyCells(moneyTotals(il))]);
    }
  }
  return {
    kind: "budget-plan",
    title: `รายงานงบประมาณ${BUDGET_REPORT_LABEL.plan}`,
    subtitle: subtitleOf(s),
    note: NOTE_SCOPE,
    columns: [{ header: "ชั้น", width: 18 }, { header: "รายการ", width: 50 }, ...MONEY_COLS],
    rows,
    footer: ["รวม", "", ...moneyCells(moneyTotals(lines))],
  };
}

function sourceReport(s: BudgetReportScope, lines: ScopeLine[]): ReportTable {
  const groups = new Map<string, ScopeLine[]>();
  for (const l of lines) groups.set(l.source_name ?? "-", [...(groups.get(l.source_name ?? "-") ?? []), l]);
  return {
    kind: "budget-source",
    title: `รายงานงบประมาณ${BUDGET_REPORT_LABEL.source}`,
    subtitle: subtitleOf(s),
    note: NOTE_SCOPE,
    columns: [{ header: "แหล่งเงิน", width: 30 }, { header: "จำนวนหมวดรายจ่าย", width: 14, align: "right" }, ...MONEY_COLS],
    rows: [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "th"))
      .map(([name, gl]) => [name, new Set(gl.map((l) => l.item_id)).size, ...moneyCells(moneyTotals(gl))]),
    footer: ["รวม", new Set(lines.map((l) => l.item_id)).size, ...moneyCells(moneyTotals(lines))],
  };
}

async function unitReport(s: BudgetReportScope, query: (unitId: string) => string): Promise<ReportTable> {
  const [rows, lines] = await Promise.all([fetchUnitReport(s.year.id, s.unit.id), fetchScopeLines(s.year.id, s.unit.id, true)]);
  return {
    kind: "budget-unit",
    title: `รายงานงบประมาณ${BUDGET_REPORT_LABEL.unit}`,
    subtitle: `${s.unit.name} และหน่วยใต้สังกัด · ปีงบประมาณ ${s.year.year_be}`,
    note:
      "แถวแรก = งบของหน่วยที่เลือกเอง (จัดสรรออก = จัดสรรให้หน่วยใต้สังกัดและสำนัก) แถวถัดไป = หน่วยใต้สังกัดชั้นถัดไป รวมหน่วยใต้สังกัดของแต่ละหน่วย " +
      "แถวรวมตัดการจัดสรรภายในสายออก จึงไม่เท่ากับผลบวกของแถว กดชื่อหน่วยเพื่อเจาะดูหน่วยใต้สังกัด",
    columns: [{ header: "หน่วย", width: 36 }, ...MONEY_COLS],
    rows: rows.map((r) => [`${r.unit_name}${r.is_self ? " (หน่วยนี้)" : ""}`, ...moneyCells(moneyTotals([r]))]),
    rowLinks: rows.map((r) => (!r.is_self && r.has_children ? query(r.org_unit_id) : null)),
    footer: ["รวมทั้งสาย", ...moneyCells(moneyTotals(lines))],
  };
}

async function quarterReport(s: BudgetReportScope, lines: ScopeLine[]): Promise<ReportTable> {
  const months = await fetchMonthly(s.year.id, s.unit.id, s.sub);
  const base = ownBase(moneyTotals(lines));
  const targets = yearTargets(s.year);
  let cum = 0;
  const rows = [0, 1, 2, 3].map((q) => {
    const ms = months.filter((m) => Math.floor((m.month_no - 1) / 3) === q);
    const com = sumMoney(ms.map((m) => m.committed));
    const dis = sumMoney(ms.map((m) => m.disbursed));
    cum = n2(cum + dis);
    return [
      QUARTER_LABEL[q],
      com,
      dis,
      cum,
      base > 0 ? Math.round((cum / base) * 10000) / 100 : "-",
      targets ? targets[q] : "-",
    ] as (string | number)[];
  });
  return {
    kind: "budget-quarter",
    title: `รายงานงบประมาณ${BUDGET_REPORT_LABEL.quarter}`,
    subtitle: subtitleOf(s),
    note: `ผูกพันสุทธิ = ยอดที่อนุมัติในไตรมาส หักคืนเงินเหลือจ่ายในไตรมาส · ร้อยละสะสม = เบิกจ่ายสะสม ÷ วงเงินที่ใช้เอง (${base.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท)${targets ? "" : " · ยังไม่ได้ตั้งเป้าการเบิกจ่ายของปีนี้"}`,
    columns: [
      { header: "ไตรมาส", width: 26 },
      money("ผูกพันสุทธิ"),
      money("เบิกจ่าย"),
      money("เบิกจ่ายสะสม"),
      { header: "ร้อยละสะสม", width: 12, align: "right", format: "percent" },
      { header: "เป้าสะสม", width: 12, align: "right", format: "percent" },
    ],
    rows,
    footer: ["รวม", sumMoney(rows.map((r) => r[1])), sumMoney(rows.map((r) => r[2])), "", "", ""],
  };
}

async function detailReport(s: BudgetReportScope): Promise<ReportTable> {
  const rows = await fetchDisbursementReport(s.year.id, s.unit.id, s.sub);
  return {
    kind: "budget-detail",
    title: `รายงาน${BUDGET_REPORT_LABEL.detail}รายรายการ`,
    subtitle: subtitleOf(s),
    note: rows.length >= 5000 ? "แสดง 5,000 รายการแรก" : "ทุกงวดที่จ่าย และรายการปรับปรุง (จำนวนติดลบ = ลดยอด)",
    columns: [
      { header: "วันที่จ่าย", width: 14 },
      { header: "หน่วย", width: 28 },
      { header: "รายการงบประมาณ", width: 44 },
      { header: "เลขที่คำขอ", width: 16 },
      { header: "งวด", width: 8, align: "right" },
      { header: "ประเภท", width: 12 },
      { header: "ผู้รับเงิน", width: 24 },
      { header: "เลขที่ใบสำคัญ", width: 16 },
      money("จำนวนเงิน"),
      { header: "เหตุผล / หมายเหตุ", width: 30 },
    ],
    rows: rows.map((r) => [
      thaiDate(r.paid_on, "short"),
      r.unit_name,
      r.item_path,
      r.request_no,
      r.installment_no,
      r.kind === "payment" ? "จ่าย" : "ปรับปรุง",
      r.payee,
      r.voucher_no,
      n2(r.amount),
      r.reason || r.note,
    ]),
    footer: ["รวม", "", "", "", "", "", "", "", sumMoney(rows.map((r) => r.amount)), ""],
  };
}

export async function buildBudgetReport(
  kind: BudgetReportKind,
  scope: BudgetReportScope,
  unitQuery: (unitId: string) => string,
): Promise<ReportTable> {
  if (kind === "unit") return unitReport(scope, unitQuery);
  if (kind === "detail") return detailReport(scope);
  const lines = await fetchScopeLines(scope.year.id, scope.unit.id, scope.sub);
  if (kind === "source") return sourceReport(scope, lines);
  if (kind === "quarter") return quarterReport(scope, lines);
  return planReport(scope, lines);
}
