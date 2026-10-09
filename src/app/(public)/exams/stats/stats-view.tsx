"use client";

import { useMemo, useState } from "react";

import type { PublicStatRow } from "@/lib/exam-batches";
import { EXAM_LEVELS, EXAM_TYPE_LABEL, EXAM_TYPES, examName, type ExamType } from "@/lib/exam-forms";

const n = (v: number) => v.toLocaleString("th-TH");
const selectClass = "h-11 rounded-md border border-input bg-background px-3 text-base";
/** สีเดียวสำหรับแท่งจำนวน (ชุดเดียวกับกราฟผลการเรียน บทที่ 14: ทองเข้ม ผ่านเกณฑ์ความต่างสีบนพื้นขาว) */
const BAR = "#8a6508";
const STAGE_ORDER = ["ประถม", "มัธยม", "อุดม"];

type Item = { key: string; label: string; value: number };

function group(rows: PublicStatRow[], keyOf: (r: PublicStatRow) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + r.candidates);
  return m;
}

/** แผนภูมิแท่งแนวนอน 1 ชุดข้อมูล: ป้ายด้านซ้าย ค่าที่ปลายแท่ง ชี้หรือโฟกัสเพื่อดูรายละเอียด */
function BarList({ items, label, testId }: { items: Item[]; label: string; testId: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="flex flex-col gap-2" aria-label={label} data-testid={testId}>
      {items.map((i) => {
        const pct = total ? Math.round((i.value / total) * 1000) / 10 : 0;
        const tip = `${i.label}: ${n(i.value)} คน (ร้อยละ ${pct.toLocaleString("th-TH")})`;
        return (
          <li
            key={i.key}
            tabIndex={0}
            title={tip}
            aria-label={tip}
            className="group grid grid-cols-[minmax(7rem,12rem)_1fr] items-center gap-3 rounded-md px-1 py-0.5 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate text-sm sm:text-base">{i.label}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-4 min-w-0 flex-1">
                <span
                  className="block h-4 rounded-r-[4px]"
                  style={{ width: `${i.value ? Math.max(1, (i.value / max) * 100) : 0}%`, backgroundColor: BAR }}
                />
              </span>
              <span className="w-24 shrink-0 text-right text-sm tabular-nums">{n(i.value)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Table({ head, rows, testId }: { head: string[]; rows: (string | number)[][]; testId: string }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-left" data-testid={testId}>
        <thead className="bg-secondary text-sm">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={i === head.length - 1 ? "px-3 py-2 text-right" : "px-3 py-2"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td key={j} className={typeof c === "number" ? "px-3 py-2 text-right tabular-nums" : "px-3 py-2"}>
                  {typeof c === "number" ? n(c) : c || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** สถิติสมัครสอบ: เลือกปีและประเภท แล้วแสดงยอดรวม แผนภูมิ และตาราง (ข้อมูลรวม ไม่มีรายบุคคล) */
export function StatsView({ rows }: { rows: PublicStatRow[] }) {
  const years = useMemo(() => [...new Set(rows.map((r) => r.year_be))].sort((a, b) => b - a), [rows]);
  const [year, setYear] = useState<number | null>(years[0] ?? null);
  const [type, setType] = useState<ExamType | "all">("all");

  const selected = useMemo(
    () => rows.filter((r) => r.year_be === year && (type === "all" || r.exam_type === type)),
    [rows, year, type],
  );

  if (rows.length === 0 || year === null) {
    return (
      <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="stats-empty">
        ยังไม่มีบัญชีผู้สมัครที่ส่งแล้ว
      </p>
    );
  }

  const total = selected.reduce((s, r) => s + r.candidates, 0);
  const byType = group(selected, (r) => r.exam_type);

  // ชั้นและช่วงชั้น เรียงตามประเภท ชั้น ช่วงชั้น
  const levelKey = (r: PublicStatRow) => `${r.exam_type}|${r.level}|${r.stage}`;
  const byLevel = group(selected, levelKey);
  const levelItems: Item[] = [];
  for (const t of EXAM_TYPES) {
    for (const l of EXAM_LEVELS) {
      const stages = [...new Set(selected.filter((r) => r.exam_type === t && r.level === l).map((r) => r.stage))].sort(
        (a, b) => (STAGE_ORDER.indexOf(a) + 1 || 99) - (STAGE_ORDER.indexOf(b) + 1 || 99),
      );
      for (const s of stages) {
        const key = `${t}|${l}|${s}`;
        levelItems.push({ key, label: `${examName(t, l)}${s ? ` · ${s}` : ""}`, value: byLevel.get(key) ?? 0 });
      }
    }
  }

  const byRegion = group(selected, (r) => r.region_name || "ไม่ระบุภาค");
  const regionItems: Item[] = [...byRegion.entries()]
    .map(([k, v]) => ({ key: k, label: k, value: v }))
    .sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));

  const provinceMap = new Map<string, { region: string; province: string; value: number }>();
  for (const r of selected) {
    const key = `${r.region_name}|${r.province_name}`;
    const cur = provinceMap.get(key) ?? { region: r.region_name, province: r.province_name || "ไม่ระบุจังหวัด", value: 0 };
    cur.value += r.candidates;
    provinceMap.set(key, cur);
  }
  const provinces = [...provinceMap.values()].sort((a, b) => b.value - a.value || a.province.localeCompare(b.province, "th"));

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="เลือกข้อมูล">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">ปีการศึกษา</span>
          <select className={selectClass} value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="stats-year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">ประเภท</span>
          <select
            className={selectClass}
            value={type}
            onChange={(e) => setType(e.target.value as ExamType | "all")}
            data-testid="stats-type"
          >
            <option value="all">ทั้งหมด</option>
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="stats-tiles">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">ผู้สมัครทั้งหมด ปี {year}</p>
          <p className="text-3xl font-bold text-primary" data-testid="stats-total">
            {n(total)}
          </p>
        </div>
        {EXAM_TYPES.filter((t) => type === "all" || t === type).map((t) => (
          <div key={t} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{EXAM_TYPE_LABEL[t]}</p>
            <p className="text-3xl font-bold">{n(byType.get(t) ?? 0)}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="by-level">
        <h2 id="by-level" className="text-xl font-bold text-primary">
          แยกตามชั้นและช่วงชั้น
        </h2>
        <div className="mt-3 rounded-xl border bg-card p-4">
          <BarList items={levelItems} label="จำนวนผู้สมัครแยกตามชั้นและช่วงชั้น" testId="chart-level" />
        </div>
        <Table
          head={["ประเภท", "ชั้น", "ช่วงชั้น", "ผู้สมัคร (คน)"]}
          rows={levelItems.map((i) => {
            const [t, l, s] = i.key.split("|");
            return [EXAM_TYPE_LABEL[t as ExamType], examName(t, l).replace(EXAM_TYPE_LABEL[t as ExamType], ""), s, i.value];
          })}
          testId="table-level"
        />
      </section>

      <section aria-labelledby="by-region">
        <h2 id="by-region" className="text-xl font-bold text-primary">
          แยกตามภาค (ที่ตั้งสนามสอบ)
        </h2>
        <div className="mt-3 rounded-xl border bg-card p-4">
          <BarList items={regionItems} label="จำนวนผู้สมัครแยกตามภาค" testId="chart-region" />
        </div>
      </section>

      <section aria-labelledby="by-province">
        <h2 id="by-province" className="text-xl font-bold text-primary">
          แยกตามจังหวัด (ที่ตั้งสนามสอบ)
        </h2>
        <Table
          head={["จังหวัด", "ภาค", "ผู้สมัคร (คน)"]}
          rows={provinces.map((p) => [p.province, p.region, p.value])}
          testId="table-province"
        />
      </section>
    </div>
  );
}
