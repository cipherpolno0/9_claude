"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText, selectClass } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category, Item, Warehouse } from "@/lib/inventory";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";

import { saveCategory, saveItem, saveWarehouse } from "../actions";

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) => {
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setFlash(r.message ?? "บันทึกแล้ว");
        after?.();
        router.refresh();
      } else setError(r.error ?? "บันทึกไม่สำเร็จ");
    });
  };
  return { error, flash, pending, run };
}

/** เพิ่มคลัง: คลังกลางของหน่วย หรือคลังย่อยใต้คลังกลางของหน่วยเหนือ */
export function NewWarehouseForm({ units, mains }: { units: AccessibleOrgUnit[]; mains: Warehouse[] }) {
  const { error, flash, pending, run } = useAction();
  const central = units.find((u) => u.level === "central" && u.selectable);
  const [kind, setKind] = useState<"main" | "sub">("main");
  const [atCentral, setAtCentral] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="new-warehouse-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        run(
          () =>
            saveWarehouse({
              id: null,
              orgUnitId: atCentral && central ? central.id : String(f.get("org_unit_id") ?? ""),
              kind,
              parentId: String(f.get("parent_id") ?? ""),
              code: String(f.get("code") ?? ""),
              name: String(f.get("name") ?? ""),
              note: String(f.get("note") ?? ""),
              isActive: true,
            }),
          () => form.reset(),
        );
      }}
    >
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 font-medium">ประเภทคลัง</legend>
        <label className="flex h-11 items-center gap-2">
          <input type="radio" name="kind" checked={kind === "main"} onChange={() => setKind("main")} className="size-5" />
          คลังกลาง (ของหน่วย)
        </label>
        <label className="flex h-11 items-center gap-2">
          <input type="radio" name="kind" checked={kind === "sub"} onChange={() => setKind("sub")} className="size-5" />
          คลังย่อย (ของหน่วยในสังกัด)
        </label>
      </fieldset>
      {central ? (
        <label className="flex h-11 items-center gap-2">
          <input type="checkbox" checked={atCentral} onChange={(e) => setAtCentral(e.target.checked)} className="size-5" />
          คลังของส่วนกลาง
        </label>
      ) : null}
      {!atCentral ? <OrgUnitPicker units={units} name="org_unit_id" required autoSelect /> : null}
      {kind === "sub" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="wh-parent">คลังกลางที่สังกัด</Label>
          <select id="wh-parent" name="parent_id" className={selectClass} defaultValue="" required>
            <option value="">เลือกคลังกลาง</option>
            {mains.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit_name})
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">หน่วยของคลังย่อยต้องเป็นหน่วยเดียวกันหรือหน่วยใต้สังกัดของคลังกลาง</p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="wh-code">รหัสคลัง</Label>
          <Input id="wh-code" name="code" maxLength={40} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="wh-name">ชื่อคลัง</Label>
          <Input id="wh-name" name="name" maxLength={200} required />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="wh-note">หมายเหตุ (ที่ตั้ง ผู้ดูแล)</Label>
        <Input id="wh-note" name="note" maxLength={500} />
      </div>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "เพิ่มคลัง"}
        </Button>
      </div>
    </form>
  );
}

/** แก้ชื่อ รหัส หมายเหตุ และเปิดหรือปิดใช้งานคลัง (หน่วย ประเภท คลังกลาง แก้ไม่ได้) */
export function WarehouseEditor({ w }: { w: Warehouse }) {
  const { error, flash, pending, run } = useAction();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        แก้ไข
      </Button>
    );
  return (
    <form
      className="mt-2 flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() =>
          saveWarehouse({
            id: w.id,
            orgUnitId: w.org_unit_id,
            kind: w.kind,
            parentId: w.parent_id ?? "",
            code: String(f.get("code") ?? ""),
            name: String(f.get("name") ?? ""),
            note: String(f.get("note") ?? ""),
            isActive: f.get("is_active") === "1",
          }),
        );
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Input aria-label="รหัสคลัง" name="code" defaultValue={w.code} maxLength={40} required />
        <Input aria-label="ชื่อคลัง" name="name" defaultValue={w.name} maxLength={200} required />
      </div>
      <Input aria-label="หมายเหตุ" name="note" defaultValue={w.note} maxLength={500} />
      <label className="flex h-11 items-center gap-2">
        <input type="checkbox" name="is_active" value="1" defaultChecked={w.is_active} className="size-5" />
        ใช้งาน (ปิดได้เมื่อไม่มียอดคงเหลือ ไม่มีคลังย่อย ใบโอนหรือใบเบิกค้าง)
      </label>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          บันทึก
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          ปิด
        </Button>
      </div>
    </form>
  );
}

/** หมวดวัสดุ (ผู้ดูแลระบบ): เพิ่ม แก้ชื่อ ลำดับ เปิดหรือปิดใช้งาน */
export function CategoryForm({ c }: { c?: Category }) {
  const { error, flash, pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-2"
      data-testid={c ? `category-${c.id}` : "new-category-form"}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        run(
          () =>
            saveCategory({
              id: c?.id ?? null,
              name: String(f.get("name") ?? ""),
              sortOrder: String(f.get("sort_order") ?? "0"),
              isActive: c ? f.get("is_active") === "1" : true,
            }),
          c ? undefined : () => form.reset(),
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor={`cat-${c?.id ?? "new"}-name`}>{c ? "ชื่อหมวด" : "ชื่อหมวดใหม่"}</Label>
          <Input id={`cat-${c?.id ?? "new"}-name`} name="name" defaultValue={c?.name} maxLength={100} required />
        </div>
        <div className="flex w-24 flex-col gap-1">
          <Label htmlFor={`cat-${c?.id ?? "new"}-sort`}>ลำดับ</Label>
          <Input id={`cat-${c?.id ?? "new"}-sort`} name="sort_order" inputMode="numeric" defaultValue={c?.sort_order ?? 0} />
        </div>
        {c ? (
          <label className="flex h-11 items-center gap-2">
            <input type="checkbox" name="is_active" value="1" defaultChecked={c.is_active} className="size-5" />
            ใช้งาน
          </label>
        ) : null}
        <Button type="submit" variant={c ? "outline" : "default"} disabled={pending}>
          {c ? "บันทึก" : "เพิ่มหมวด"}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
    </form>
  );
}

/** ทะเบียนวัสดุกลาง: รหัส ชื่อ หมวด หน่วยนับ จุดสั่งซื้อขั้นต่ำ */
export function ItemForm({ item, categories }: { item?: Item; categories: Category[] }) {
  const router = useRouter();
  const { error, flash, pending, run } = useAction();
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="item-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(async () => {
          const r = await saveItem({
            id: item?.id ?? null,
            code: String(f.get("code") ?? ""),
            name: String(f.get("name") ?? ""),
            categoryId: String(f.get("category_id") ?? ""),
            unit: String(f.get("unit") ?? ""),
            reorderPoint: String(f.get("reorder_point") ?? "0"),
            note: String(f.get("note") ?? ""),
            isActive,
          });
          if (r.ok && !item && r.id) router.push(`/app/inventory/settings/items/${r.id}?saved=1`);
          return r;
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="it-code">
            รหัส<span className="text-destructive"> *</span>
          </Label>
          <Input id="it-code" name="code" defaultValue={item?.code} maxLength={40} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="it-name">
            ชื่อวัสดุ<span className="text-destructive"> *</span>
          </Label>
          <Input id="it-name" name="name" defaultValue={item?.name} maxLength={200} required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="it-cat">หมวด</Label>
          <select id="it-cat" name="category_id" className={selectClass} defaultValue={item?.category_id ?? ""}>
            <option value="">ไม่ระบุหมวด</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.is_active && c.id !== item?.category_id}>
                {c.name}
                {c.is_active ? "" : " (ปิดใช้งาน)"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="it-unit">
            หน่วยนับ<span className="text-destructive"> *</span>
          </Label>
          <Input id="it-unit" name="unit" defaultValue={item?.unit} maxLength={30} required placeholder="เช่น รีม กล่อง ขวด" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="it-reorder">จุดสั่งซื้อขั้นต่ำ</Label>
          <Input id="it-reorder" name="reorder_point" inputMode="decimal" defaultValue={item ? String(Number(item.reorder_point)) : "0"} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="it-note">หมายเหตุ (ขนาด ยี่ห้อ)</Label>
        <Input id="it-note" name="note" defaultValue={item?.note} maxLength={500} />
      </div>
      {item ? (
        <label className="flex h-11 items-center gap-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-5" />
          ใช้งาน (ปิดแล้วเลือกในรายการใหม่ไม่ได้ ยอดเดิมยังอยู่)
        </label>
      ) : null}
      <p className="text-sm text-muted-foreground">จุดสั่งซื้อ = ยอดคงเหลือขั้นต่ำ ต่ำกว่านี้ระบบแจ้งเตือนที่หน้าคลัง (0 = ไม่เตือน) วัสดุที่มีความเคลื่อนไหวแล้วเปลี่ยนหน่วยนับไม่ได้</p>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : item ? "บันทึก" : "เพิ่มวัสดุ"}
        </Button>
      </div>
    </form>
  );
}
