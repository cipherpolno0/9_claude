"use client";

import { useMemo, useState } from "react";

import { EXAM_LEVELS, EXAM_TYPE_LABEL, EXAM_TYPES, examName, type ExamType } from "@/lib/exam-forms";
import { passPercent, stageFull, type PublicResultStatRow } from "@/lib/exam-results";

const n = (v: number) => v.toLocaleString("th-TH");
const selectClass = "h-11 rounded-md border border-input bg-background px-3 text-base";
/** สีเดียวกับกราฟสถิติสมัครสอบ (บทที่ 19) ผ่านเกณฑ์ความต่างสีบนพื้นขาว */
const BAR = "#8a6508";
const STAGE_ORDER = ["ประถม", "มัธยม", "อุดม"];

type Agg = { sent: number; absent: number; passed: number; failed: number; no_result: number };
const empty = (): Agg => ({ sent: 0, absent: 0, passed: 0, failed: 0, no_result: 0 });
const add = (a: Agg, r: PublicResultStatRow) => {
  a.sent += r.sent;
  a.absent += r.absent;
  a.passed += r.passed;
  a.failed += r.failed;
  a.no_result += r.no_result;
};
/** คงสอบ = ส่งสอบ - ขาดสอบ (ตามแบบ ศ.๔ ศ.๘) */
const remaining = (a: Agg) => a.sent - a.absent;
const pct = (a: Agg) => Number(passPercent(a.passed, remaining(a)));

type Item = { key: string; label: string; agg: Agg };

/** แถบร้อยละสอบได้ (แกนคงที่ 0-100) ป้ายซ้าย ค่าที่ปลายแถบ ชี้หรือโฟกัสเพื่อดูรายละเอียด */
function PercentBars({ items, label, testId }: { items: Item[]; label: string; testId: string }) {
  return (
    <ul className="flex flex-col gap-2" aria-label={label} data-testid={testId}>
      {items.map((i) => {
        const p = pct(i.agg);
        const tip = `${i.label}: สอบได้ ${n(i.agg.passed)} จากคงสอบ ${n(remaining(i.agg))} (ร้อยละ ${p.toLocaleString("th-TH")})`;
        return (
          <li
            key={i.key}
            tabIndex={0}
            title={tip}
            aria-label={tip}
            className="grid grid-cols-[minmax(6rem,9rem)_1fr] sm:grid-cols-[minmax(7rem,14rem)_1fr] items-center gap-3 rounded-md px-1 py-0.5 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate text-sm sm:text-base">{i.label}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-4 min-w-0 flex-1">
                <span className="block h-4 rounded-r-[4px]" style={{ width: `${p ? Math.max(1, p) : 0}%`, backgroundColor: BAR }} />
              </span>
              <span className="w-16 shrink-0 text-right text-sm tabular-nums">{p.toLocaleString("th-TH")}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AggTable({ head, items, testId }: { head: string; items: Item[]; testId: string }) {
  const cols = ["ส่งสอบ", "ขาดสอบ", "คงสอบ", "สอบได้", "สอบตก", "ร้อยละสอบได้"];
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[40rem] border-collapse text-left" data-testid={testId}>
        <thead className="bg-secondary text-sm">
          <tr>
            <th scope="col" className="px-3 py-2">
              {head}
            </th>
            {cols.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-right">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.key} className="border-t">
              <td className="px-3 py-2">{i.label}</td>
              {[i.agg.sent, i.agg.absent, remaining(i.agg), i.agg.passed, i.agg.failed].map((v, j) => (
                <td key={j} className="px-3 py-2 text-right tabular-nums">
                  {n(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{pct(i.agg).toLocaleString("th-TH")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function groupBy(rows: PublicResultStatRow[], keyOf: (r: PublicResultStatRow) => string, labelOf: (r: PublicResultStatRow) => string): Item[] {
  const m = new Map<string, Item>();
  for (const r of rows) {
    const k = keyOf(r);
    const it = m.get(k) ?? { key: k, label: labelOf(r), agg: empty() };
    add(it.agg, r);
    m.set(k, it);
  }
  return [...m.values()];
}

/** สถิติผลสอบ: ส่งสอบ ขาดสอบ คงสอบ สอบได้ สอบตก ร้อยละสอบได้ แยกปี ชั้น ภาค จังหวัด (เฉพาะรอบที่ประกาศผลแล้ว) */
export function ResultStatsView({ rows }: { rows: PublicResultStatRow[] }) {
  const years = useMemo(() => [...new Set(rows.map((r) => r.year_be))].sort((a, b) => b - a), [rows]);
  const [year, setYear] = useState<number | null>(years[0] ?? null);
  const [type, setType] = useState<ExamType | "all">("all");
  const selected = useMemo(() => rows.filter((r) => r.year_be === year && (type === "all" || r.exam_type === type)), [rows, year, type]);

  if (rows.length === 0 || year === null) {
    return (
      <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="result-stats-empty">
        ยังไม่มีการประกาศผลสอบ
      </p>
    );
  }
  const total = empty();
  selected.forEach((r) => add(total, r));
  const levelItems: Item[] = [];
  for (const t of EXAM_TYPES) {
    for (const l of EXAM_LEVELS) {
      const sub = selected.filter((r) => r.exam_type === t && r.level === l);
      if (!sub.length) continue;
      if (t === "tham_sueksa") {
        const stages = [...new Set(sub.map((r) => r.stage))].sort((a, b) => (STAGE_ORDER.indexOf(a) + 1 || 99) - (STAGE_ORDER.indexOf(b) + 1 || 99));
        for (const s of stages) {
          const agg = empty();
          sub.filter((r) => r.stage === s).forEach((r) => add(agg, r));
          levelItems.push({ key: `${t}|${l}|${s}`, label: `${examName(t, l)}${s ? ` (${stageFull(s)})` : ""}`, agg });
        }
      } else {
        const agg = empty();
        sub.forEach((r) => add(agg, r));
        levelItems.push({ key: `${t}|${l}`, label: examName(t, l), agg });
      }
    }
  }
  const regions = groupBy(selected, (r) => r.region_name || "ไม่ระบุภาค", (r) => r.region_name || "ไม่ระบุภาค").sort((a, b) =>
    a.label.localeCompare(b.label, "th", { numeric: true }),
  );
  const provinces = groupBy(selected, (r) => `${r.region_name}|${r.province_name}`, (r) => r.province_name || "ไม่ระบุจังหวัด").sort(
    (a, b) => b.agg.sent - a.agg.sent || a.label.localeCompare(b.label, "th"),
  );
  const tiles: [string, string][] = [
    ["ส่งสอบ", n(total.sent)],
    ["ขาดสอบ", n(total.absent)],
    ["คงสอบ", n(remaining(total))],
    ["สอบได้", n(total.passed)],
    ["สอบตก", n(total.failed)],
    ["ร้อยละสอบได้", `${pct(total).toLocaleString("th-TH")}%`],
  ];

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="เลือกข้อมูล">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">ปี พ.ศ.</span>
          <select className={selectClass} value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="rs-year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">ประเภท</span>
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as ExamType | "all")} data-testid="rs-type">
            <option value="all">ทั้งหมด</option>
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="rs-tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      {total.no_result ? (
        <p className="text-sm text-muted-foreground">มีผู้สมัครที่ยังไม่มีผล {n(total.no_result)} รูป/คน (นับเป็นส่งสอบ ไม่นับเป็นคงสอบที่สอบได้หรือตก)</p>
      ) : null}

      <section aria-labelledby="rs-level">
        <h2 id="rs-level" className="text-xl font-bold text-primary">
          ร้อยละสอบได้ แยกตามชั้นและช่วงชั้น
        </h2>
        <div className="mt-3 rounded-xl border bg-card p-4">
          <PercentBars items={levelItems} label="ร้อยละสอบได้แยกตามชั้น" testId="rs-chart-level" />
        </div>
        <AggTable head="ชั้น" items={levelItems} testId="rs-table-level" />
      </section>

      <section aria-labelledby="rs-region">
        <h2 id="rs-region" className="text-xl font-bold text-primary">
          แยกตามภาค (ที่ตั้งสนามสอบ)
        </h2>
        <div className="mt-3 rounded-xl border bg-card p-4">
          <PercentBars items={regions} label="ร้อยละสอบได้แยกตามภาค" testId="rs-chart-region" />
        </div>
        <AggTable head="ภาค" items={regions} testId="rs-table-region" />
      </section>

      <section aria-labelledby="rs-province">
        <h2 id="rs-province" className="text-xl font-bold text-primary">
          แยกตามจังหวัด (ที่ตั้งสนามสอบ)
        </h2>
        <AggTable head="จังหวัด" items={provinces} testId="rs-table-province" />
      </section>
    </div>
  );
}
