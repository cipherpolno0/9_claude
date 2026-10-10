"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, selectClass } from "@/components/form";
import { SearchPicker, type PickerItem } from "@/components/search-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { baht, type Recipient } from "@/lib/budget";

import { allocateBudget } from "../../../../actions";

export type ReduceTarget = { key: string; name: string; total: number };

/** จัดสรรให้หน่วยใต้สังกัด (ข้ามชั้นได้) หรือสำนักในเขต / ปรับลดการจัดสรรครั้งก่อน */
export function AllocateForm({
  itemId,
  unitId,
  remaining,
  nextRound,
  today,
  quickPicks,
  reduceTargets,
  backHref,
  search,
}: {
  itemId: string;
  unitId: string;
  remaining: number;
  nextRound: number;
  today: string;
  quickPicks: PickerItem<Recipient>[];
  reduceTargets: ReduceTarget[];
  backHref: string;
  search: (q: string) => Promise<PickerItem<Recipient>[]>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"allocate" | "reduce">(remaining > 0 ? "allocate" : "reduce");
  const [picked, setPicked] = useState<PickerItem<Recipient> | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="allocate-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        if (f.get("allocated_on_incomplete") === "1" || !f.get("allocated_on")) {
          setError("กรุณากรอกวันที่จัดสรรให้ครบ");
          return;
        }
        startTransition(async () => {
          const r = await allocateBudget({
            item: itemId,
            fromUnit: unitId,
            recipient: String(f.get("recipient") ?? ""),
            round: String(f.get("round") ?? ""),
            date: String(f.get("allocated_on") ?? ""),
            amount: String(f.get("amount") ?? ""),
            reduce: mode === "reduce",
            reference: String(f.get("reference") ?? ""),
            note: String(f.get("note") ?? ""),
          });
          if (r.ok) router.push(`${backHref}&saved=${encodeURIComponent(r.message ?? "บันทึกแล้ว")}`);
          else setError(r.error);
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">ชนิดรายการ</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" className="size-5" checked={mode === "allocate"} disabled={remaining <= 0} onChange={() => setMode("allocate")} />
            จัดสรรเพิ่ม (คงเหลือ {baht(remaining)} บาท)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" className="size-5" checked={mode === "reduce"} disabled={reduceTargets.length === 0} onChange={() => setMode("reduce")} />
            ปรับลดการจัดสรรครั้งก่อน
          </label>
        </div>
      </fieldset>

      {mode === "allocate" ? (
        <div className="flex flex-col gap-2">
          <SearchPicker<Recipient>
            key={pickerKey}
            name="recipient"
            label="ผู้รับการจัดสรร"
            placeholder="พิมพ์ชื่อหรือรหัสหน่วย หรือชื่อสำนัก อย่างน้อย 2 ตัวอักษร"
            initial={picked}
            search={search}
            onPick={setPicked}
            required
            hint="หน่วยใต้สังกัดชั้นใดก็ได้ หรือสำนักเรียน / สำนักศาสนศึกษาในเขต"
          />
          {quickPicks.length && !picked ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="quick-picks">
              <span className="text-sm text-muted-foreground">เลือกเร็ว (หน่วยชั้นถัดไป):</span>
              {quickPicks.map((q) => (
                <Button
                  key={q.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPicked(q);
                    setPickerKey((k) => k + 1);
                  }}
                >
                  {q.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label htmlFor="recipient-reduce">
            ผู้รับที่ต้องการปรับลด<span className="text-destructive"> *</span>
          </Label>
          <select id="recipient-reduce" name="recipient" className={selectClass} required defaultValue="">
            <option value="">เลือกผู้รับ</option>
            {reduceTargets.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name} (จัดสรรสุทธิ {baht(t.total)} บาท)
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="round">
            ครั้งที่<span className="text-destructive"> *</span>
          </Label>
          <Input id="round" name="round" inputMode="numeric" defaultValue={String(nextRound)} required />
        </div>
        <ThaiDateInput label="วันที่จัดสรร" name="allocated_on" defaultValue={today} required className="sm:col-span-2" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="amount">
            {mode === "reduce" ? "จำนวนเงินที่ปรับลด (บาท)" : "จำนวนเงิน (บาท)"}
            <span className="text-destructive"> *</span>
          </Label>
          <Input id="amount" name="amount" inputMode="decimal" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="reference">เอกสารอ้างอิง (เช่น เลขที่หนังสือ)</Label>
          <Input id="reference" name="reference" maxLength={200} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="note">หมายเหตุ</Label>
        <Input id="note" name="note" maxLength={500} />
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : mode === "reduce" ? "บันทึกการปรับลด" : "บันทึกการจัดสรร"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={pending}>
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
