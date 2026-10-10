"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayIso } from "@/lib/inventory";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";

import { closeCount, createCount } from "../assets/actions";

export function CountCreateForm({ units, defaultTitle }: { units: AccessibleOrgUnit[]; defaultTitle: string }) {
  const router = useRouter();
  const central = units.find((u) => u.level === "central" && u.selectable);
  const [atCentral, setAtCentral] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="count-create-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const f = new FormData(e.currentTarget);
        if (f.get("started_on_incomplete")) return setError("กรุณากรอกวันที่เริ่มให้ครบ");
        const unit = atCentral && central ? central.id : String(f.get("org_unit_id") ?? "");
        startTransition(async () => {
          const r = await createCount(unit, String(f.get("title") ?? ""), f.get("include_sub") === "1", String(f.get("started_on") ?? ""), String(f.get("note") ?? ""));
          if (r.ok && r.id) router.push(`/app/inventory/counts/${r.id}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="cn-title">ชื่อรอบ</Label>
        <Input id="cn-title" name="title" defaultValue={defaultTitle} maxLength={200} required />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">หน่วยที่ตรวจนับ</legend>
        {central ? (
          <label className="flex h-11 items-center gap-2">
            <input type="checkbox" checked={atCentral} onChange={(e) => setAtCentral(e.target.checked)} className="size-5" />
            ส่วนกลาง
          </label>
        ) : null}
        {atCentral ? null : <OrgUnitPicker units={units} name="org_unit_id" required />}
      </fieldset>
      <label className="flex h-11 items-center gap-2">
        <input type="checkbox" name="include_sub" value="1" defaultChecked className="size-5" />
        รวมครุภัณฑ์ของหน่วยใต้สังกัด
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <ThaiDateInput label="วันที่เริ่มตรวจนับ" name="started_on" defaultValue={todayIso()} required />
        <div className="flex flex-col gap-1">
          <Label htmlFor="cn-note">หมายเหตุ (คณะกรรมการ ฯลฯ)</Label>
          <Input id="cn-note" name="note" maxLength={500} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        ระบบสร้างรายการที่ต้องตรวจจากครุภัณฑ์ที่ยังไม่จำหน่ายในขอบเขต ณ วันเปิดรอบ เปิดได้ครั้งละ 1 รอบต่อหน่วย
      </p>
      <ErrorText>{error}</ErrorText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังสร้าง..." : "เปิดรอบตรวจนับ"}
        </Button>
      </div>
    </form>
  );
}

export function CloseCountButton({ id, unchecked }: { id: string; unchecked: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(unchecked ? `ยังไม่ได้ตรวจ ${unchecked} รายการ ปิดรอบแล้วจะบันทึกเป็น ไม่พบ ยืนยันหรือไม่` : "ปิดรอบตรวจนับ ยืนยันหรือไม่")) return;
            startTransition(async () => {
              setError(null);
              const r = await closeCount(id);
              if (r.ok) {
                setFlash(r.message ?? null);
                router.refresh();
              } else setError(r.error);
            });
          }}
        >
          ปิดรอบตรวจนับ
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
    </div>
  );
}
