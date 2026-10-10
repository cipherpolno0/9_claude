"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXAM_LEVEL_LABEL, EXAM_TYPE_LABEL, examName, type ExamLevel, type ExamType } from "@/lib/exam-forms";
import { passerName, stageFull, type PublicPasser, type PublicResultPlace } from "@/lib/exam-results";
import { cn } from "@/lib/utils";

import { loadResultList, loadResultPlaces, searchResults } from "./actions";

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";
export type ResultChoice = { year: number; type: ExamType; level: ExamLevel };

function PasserTable({ rows, type, level }: { rows: PublicPasser[]; type: ExamType; level: ExamLevel }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[36rem] border-collapse text-left" data-testid="passer-table">
        <thead className="bg-secondary text-sm">
          <tr>
            <th scope="col" className="px-3 py-2">ชื่อ</th>
            <th scope="col" className="px-3 py-2">ชั้น</th>
            <th scope="col" className="px-3 py-2">สำนัก/สถานศึกษา</th>
            <th scope="col" className="px-3 py-2">ผลสอบ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t" data-testid="passer-row">
              <td className="px-3 py-2 font-medium">{passerName(r)}</td>
              <td className="px-3 py-2">
                {examName(type, level)}
                {r.stage ? ` (${stageFull(r.stage)})` : ""}
              </td>
              <td className="px-3 py-2">{r.place_name}</td>
              <td className="px-3 py-2 font-semibold text-green-800">สอบได้</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ค้นผลสอบ: เลือกปี ประเภท ชั้น แล้วค้นด้วยชื่อ หรือดูตามจังหวัด > สำนัก (แสดงเฉพาะผู้สอบได้) */
export function ResultsFinder({ choices }: { choices: ResultChoice[] }) {
  const years = useMemo(() => [...new Set(choices.map((c) => c.year))].sort((a, b) => b - a), [choices]);
  const [year, setYear] = useState(years[0] ?? 0);
  const types = [...new Set(choices.filter((c) => c.year === year).map((c) => c.type))];
  const [type, setType] = useState<ExamType>(types[0] ?? "nak_tham");
  const levels = choices.filter((c) => c.year === year && c.type === type).map((c) => c.level);
  const [level, setLevel] = useState<ExamLevel>(levels[0] ?? "tri");
  const [mode, setMode] = useState<"name" | "place">("name");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [rows, setRows] = useState<PublicPasser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [places, setPlaces] = useState<PublicResultPlace[] | null>(null);
  const [province, setProvince] = useState("");
  const [place, setPlace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setRows(null);
    setPlaces(null);
    setProvince("");
    setPlace("");
    setError(null);
  };
  const fixChoice = (y: number, t: ExamType, l: ExamLevel) => {
    const ts = [...new Set(choices.filter((c) => c.year === y).map((c) => c.type))];
    const t2 = ts.includes(t) ? t : (ts[0] ?? t);
    const ls = choices.filter((c) => c.year === y && c.type === t2).map((c) => c.level);
    const l2 = ls.includes(l) ? l : (ls[0] ?? l);
    setYear(y);
    setType(t2);
    setLevel(l2);
    reset();
    if (mode === "place") startTransition(async () => setPlaces(await loadResultPlaces({ year: y, type: t2, level: l2 })));
  };
  const provinces = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of places ?? []) m.set(p.province_name, (m.get(p.province_name) ?? 0) + p.passed);
    return [...m.entries()];
  }, [places]);

  if (choices.length === 0) {
    return (
      <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="results-none">
        ยังไม่มีการประกาศผลสอบ
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3" role="group" aria-label="เลือกการสอบ">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ปี พ.ศ.</span>
          <select className={selectClass} value={year} onChange={(e) => fixChoice(Number(e.target.value), type, level)} data-testid="result-year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ประเภท</span>
          <select className={selectClass} value={type} onChange={(e) => fixChoice(year, e.target.value as ExamType, level)} data-testid="result-type">
            {types.map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ชั้น</span>
          <select className={selectClass} value={level} onChange={(e) => fixChoice(year, type, e.target.value as ExamLevel)} data-testid="result-level">
            {levels.map((l) => (
              <option key={l} value={l}>
                {EXAM_LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div role="tablist" aria-label="วิธีค้น" className="flex flex-wrap gap-2">
        {(
          [
            ["name", "ค้นด้วยชื่อ"],
            ["place", "ดูตามจังหวัดและสำนัก"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              reset();
              if (m === "place") {
                startTransition(async () => setPlaces(await loadResultPlaces({ year, type, level })));
              }
            }}
            className={cn("rounded-md px-4 py-2 font-medium", mode === m ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-secondary")}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "name" ? (
        <form
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          data-testid="result-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (first.trim().length < 2) {
              setError("กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร");
              return;
            }
            startTransition(async () => {
              const r = await searchResults({ year, type, level, first, last });
              if (r.ok) {
                setError(null);
                setRows(r.rows);
                setTotal(r.total);
              } else {
                setError(r.error);
                if (!r.limited) setRows(null);
              }
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="res-first">ชื่อ (ไม่ต้องใส่คำนำหน้า)</Label>
            <Input id="res-first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={100} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="res-last">นามสกุล หรือฉายา (ไม่บังคับ)</Label>
            <Input id="res-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={100} autoComplete="off" />
          </div>
          <Button type="submit" disabled={pending}>
            <Search aria-hidden />
            {pending ? "กำลังค้น..." : "ค้นผลสอบ"}
          </Button>
          <p className="text-sm text-muted-foreground sm:col-span-3">ชื่อต้องสะกดตรงทั้งคำ แสดงไม่เกิน 20 รายการ ค้นได้ไม่เกิน 10 ครั้งต่อนาที</p>
        </form>
      ) : (
        <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" data-testid="result-place-form">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">จังหวัด (ที่ตั้งสำนัก)</span>
            <select
              className={selectClass}
              value={province}
              onChange={(e) => {
                setProvince(e.target.value);
                setPlace("");
                setRows(null);
              }}
              data-testid="result-province"
            >
              <option value="">{places === null ? "กำลังโหลด..." : provinces.length ? "เลือกจังหวัด" : "ไม่มีผู้สอบได้"}</option>
              {provinces.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count.toLocaleString("th-TH")} รูป/คน)
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">สำนัก/สถานศึกษา</span>
            <select
              className={selectClass}
              value={place}
              disabled={!province}
              onChange={(e) => {
                const id = e.target.value;
                setPlace(id);
                if (!id) return;
                startTransition(async () => {
                  const list = await loadResultList({ year, type, level, place: id });
                  setRows(list);
                  setTotal(list.length);
                });
              }}
              data-testid="result-place"
            >
              <option value="">เลือกสำนัก</option>
              {(places ?? [])
                .filter((p) => p.province_name === province)
                .map((p) => (
                  <option key={p.place_id} value={p.place_id}>
                    {p.place_name} ({p.passed.toLocaleString("th-TH")})
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {rows === null ? null : rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="result-none">
          ไม่พบผู้สอบได้ตามที่ค้น (หน้านี้แสดงเฉพาะผู้สอบได้ ตรวจการสะกดชื่อ หรือสอบถามสำนักเรียน)
        </p>
      ) : (
        <>
          <p data-testid="result-total">
            ผู้สอบได้ {total.toLocaleString("th-TH")} รายการ
            {total > rows.length ? ` แสดง ${rows.length} รายการแรก กรุณากรอกนามสกุลหรือฉายาเพิ่ม` : ""}
          </p>
          <PasserTable rows={rows} type={type} level={level} />
        </>
      )}
    </div>
  );
}
