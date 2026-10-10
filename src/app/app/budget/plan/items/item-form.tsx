"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KIND_LABEL, type BudgetKind, type BudgetOption } from "@/lib/budget";

import { saveBudgetItem } from "../../actions";

/** เพิ่มหรือแก้ไขรายการงบประมาณ (แผนงาน โครงการหรือกิจกรรม หมวดรายจ่าย) */
export function ItemForm({
  id,
  kind,
  yearId,
  unitId,
  parentId,
  query,
  backHref,
  categories,
  sources,
  amountLocked,
  initial,
}: {
  id: string | null;
  kind: BudgetKind;
  yearId: string;
  unitId: string;
  parentId: string | null;
  /** ?year=&unit= ของหน้าที่จะกลับไป */
  query: string;
  backHref: string;
  categories: BudgetOption[];
  sources: BudgetOption[];
  /** รายการที่เริ่มจัดสรรแล้ว: เปลี่ยนวงเงิน หมวด แหล่งเงิน ไม่ได้ (ต้องยื่นคำขอโอน) */
  amountLocked: boolean;
  initial: { name: string; code: string; category: string; source: string; amount: string; note: string };
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV({ ...v, [k]: e.target.value });

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="item-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await saveBudgetItem({
            id,
            year: yearId,
            unit: unitId,
            parent: parentId,
            kind,
            name: v.name,
            code: v.code,
            category: v.category || null,
            source: v.source || null,
            amount: v.amount,
            note: v.note,
          });
          if (r.ok && r.id) router.push(`/app/budget/plan/items/${r.id}?${query}&saved=${encodeURIComponent(r.message ?? "บันทึกแล้ว")}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      {kind === "category" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="category">
              หมวดรายจ่าย<span className="text-destructive"> *</span>
            </Label>
            <select id="category" className={selectClass} value={v.category} onChange={set("category")} disabled={amountLocked} required>
              <option value="">เลือกหมวดรายจ่าย</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.is_active && c.id !== initial.category}>
                  {c.name}
                  {c.is_active ? "" : " (ปิดใช้งาน)"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="source">
              แหล่งเงิน<span className="text-destructive"> *</span>
            </Label>
            <select id="source" className={selectClass} value={v.source} onChange={set("source")} disabled={amountLocked} required>
              <option value="">เลือกแหล่งเงิน</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.is_active && s.id !== initial.source}>
                  {s.name}
                  {s.is_active ? "" : " (ปิดใช้งาน)"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="amount">
              วงเงิน (บาท)<span className="text-destructive"> *</span>
            </Label>
            <Input id="amount" inputMode="decimal" value={v.amount} onChange={set("amount")} disabled={amountLocked} required />
            <p className="text-sm text-muted-foreground">
              {amountLocked
                ? "รายการนี้เริ่มจัดสรรแล้ว เปลี่ยนวงเงิน หมวด และแหล่งเงินไม่ได้ ถ้าต้องการย้ายเงินระหว่างรายการ ให้ยื่นคำขอโอนเปลี่ยนแปลง"
                : "ตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 12,500.50"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label htmlFor="name">
            ชื่อ{KIND_LABEL[kind]}
            <span className="text-destructive"> *</span>
          </Label>
          <Input id="name" value={v.name} onChange={set("name")} maxLength={200} required />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="code">รหัส (ถ้ามี)</Label>
          <Input id="code" value={v.code} onChange={set("code")} maxLength={40} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="note">หมายเหตุ</Label>
          <Input id="note" value={v.note} onChange={set("note")} maxLength={500} />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : id ? "บันทึกการแก้ไข" : `เพิ่ม${KIND_LABEL[kind]}`}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={pending}>
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
