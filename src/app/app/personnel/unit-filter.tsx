"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { OrgUnitPicker } from "@/components/org-unit-picker";
import { Button } from "@/components/ui/button";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";

/**
 * กรองตามเขตปกครอง (รวมเขตใต้สังกัด) เก็บค่าในที่อยู่หน้าเว็บ (ค่าเริ่มต้น f_unit)
 * หน้าผังและรายงานใช้ param="unit" และแสดงชื่อเขตที่เลือกอยู่ด้วย currentName
 */
export function UnitFilter({
  units,
  value,
  param = "f_unit",
  emptyLabel = "ทุกเขตที่ท่านดูแล",
  currentName,
  applyLabel = "กรองตามเขตนี้",
  allowClear = true,
}: {
  units: AccessibleOrgUnit[];
  value: string;
  param?: string;
  emptyLabel?: string;
  currentName?: string;
  applyLabel?: string;
  allowClear?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(value);
  const [pending, startTransition] = useTransition();
  const current = units.find((u) => u.id === value);

  const apply = (unitId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (unitId) next.set(param, unitId);
    else next.delete(param);
    next.delete("page");
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="rounded-xl border bg-card p-4" data-testid="unit-filter">
      <div className="flex flex-wrap items-center gap-3">
        <p>
          <span className="font-semibold">เขตปกครอง:</span>{" "}
          <span data-testid="unit-filter-value">{currentName ?? (current ? current.name : emptyLabel)}</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} disabled={pending}>
          {open ? "ซ่อนตัวเลือกเขต" : "เลือกเขต"}
        </Button>
        {value && allowClear ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => apply("")} disabled={pending}>
            ล้างตัวกรองเขต
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          <OrgUnitPicker units={units} name="filter_unit" defaultValue={value || null} onChange={setPicked} />
          <div>
            <Button type="button" onClick={() => apply(picked)} disabled={pending || !picked}>
              {applyLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
