"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FISCAL_STATUS_LABEL, type BudgetOption, type FiscalYear } from "@/lib/budget";
import { thaiDate } from "@/lib/thai";

import { addFiscalYear, saveBudgetOption, setFiscalYearStatus } from "../actions";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const r = await fn();
      if (r.ok) {
        setFlash(r.message ?? "บันทึกแล้ว");
        after?.();
        router.refresh();
      } else setError(r.error);
    });
  return { error, flash, pending, run };
}

/** ปีงบประมาณ: เพิ่มปี เปิด/ปิดปี (ปิดแล้วแก้ไข จัดสรร หรือโอนไม่ได้) */
export function FiscalYearManager({ years }: { years: FiscalYear[] }) {
  const { error, flash, pending, run } = useRun();
  const [year, setYear] = useState("");
  return (
    <div className="flex flex-col gap-3" data-testid="fiscal-years">
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {years.length === 0 ? <li className="p-3 text-muted-foreground">ยังไม่มีปีงบประมาณ</li> : null}
        {years.map((y) => (
          <li key={y.id} className="flex flex-wrap items-center gap-3 p-3" data-testid="fiscal-year" data-year={y.year_be}>
            <span className="text-lg font-bold text-primary">{y.year_be}</span>
            <span className="text-muted-foreground">
              {thaiDate(y.starts_on, "short")} – {thaiDate(y.ends_on, "short")}
            </span>
            <span className={y.status === "open" ? "font-semibold text-green-800" : "font-semibold text-destructive"}>
              {FISCAL_STATUS_LABEL[y.status]}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={pending}
              onClick={() => {
                const next = y.status === "open" ? "closed" : "open";
                if (next === "closed" && !window.confirm(`ปิดปีงบประมาณ ${y.year_be}? หลังปิดแล้วแก้ไข จัดสรร และโอนไม่ได้ (เปิดใหม่ได้ภายหลัง)`)) return;
                run(() => setFiscalYearStatus(y.id, next));
              }}
            >
              {y.status === "open" ? "ปิดปี" : "เปิดปีอีกครั้ง"}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addFiscalYear(year, ""), () => setYear(""));
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-year">เพิ่มปีงบประมาณ (พ.ศ.)</Label>
          <Input id="new-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className="w-40" placeholder="เช่น 2570" />
        </div>
        <Button type="submit" disabled={pending || !year.trim()}>
          เพิ่มปี
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">ปีงบ 2570 = 1 ต.ค. 2569 – 30 ก.ย. 2570 ระบบคำนวณวันเริ่มและวันสิ้นสุดให้</p>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
    </div>
  );
}

function OptionRow({ table, option }: { table: "sources" | "categories"; option: BudgetOption }) {
  const { error, pending, run } = useRun();
  const [name, setName] = useState(option.name);
  const [sort, setSort] = useState(String(option.sort_order));
  return (
    <li className="flex flex-col gap-2 p-3" data-testid={`option-${table}`} data-name={option.name}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor={`${table}-${option.id}-name`} className="sr-only">
            ชื่อ
          </Label>
          <Input id={`${table}-${option.id}-name`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex w-24 flex-col gap-1">
          <Label htmlFor={`${table}-${option.id}-sort`} className="sr-only">
            ลำดับ
          </Label>
          <Input id={`${table}-${option.id}-sort`} inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(() => saveBudgetOption(table, option.id, { name, sort_order: sort, is_active: option.is_active }))}
        >
          บันทึก
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => saveBudgetOption(table, option.id, { name: option.name, sort_order: String(option.sort_order), is_active: !option.is_active }))}
        >
          {option.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        </Button>
        {!option.is_active ? <span className="text-sm text-muted-foreground">ปิดใช้งานอยู่</span> : null}
      </div>
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

/** แหล่งเงิน / หมวดรายจ่าย: เพิ่ม แก้ชื่อ ลำดับ เปิด/ปิดใช้งาน (ไม่ลบ) */
export function OptionManager({ table, title, options }: { table: "sources" | "categories"; title: string; options: BudgetOption[] }) {
  const { error, flash, pending, run } = useRun();
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {options.map((o) => (
          <OptionRow key={`${o.id}-${o.name}-${o.sort_order}-${o.is_active}`} table={table} option={o} />
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => saveBudgetOption(table, null, { name, sort_order: String(options.length + 1), is_active: true }),
            () => setName(""),
          );
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor={`new-${table}`}>เพิ่ม{title}</Label>
          <Input id={`new-${table}`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className="w-64" />
        </div>
        <Button type="submit" disabled={pending || !name.trim()}>
          เพิ่ม
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
    </div>
  );
}
