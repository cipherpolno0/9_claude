"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { OrgUnitPicker } from "@/components/org-unit-picker";
import { Button } from "@/components/ui/button";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";

/** กรองรายชื่อตามเขตปกครอง (รวมเขตใต้สังกัด) เก็บค่าในที่อยู่หน้าเว็บเป็น f_unit */
export function UnitFilter({ units, value }: { units: AccessibleOrgUnit[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(value);
  const [pending, startTransition] = useTransition();
  const current = units.find((u) => u.id === value);

  const apply = (unitId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (unitId) next.set("f_unit", unitId);
    else next.delete("f_unit");
    next.delete("page");
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="rounded-xl border bg-card p-4" data-testid="unit-filter">
      <div className="flex flex-wrap items-center gap-3">
        <p>
          <span className="font-semibold">เขตปกครอง:</span>{" "}
          <span data-testid="unit-filter-value">{current ? current.name : "ทุกเขตที่ท่านดูแล"}</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} disabled={pending}>
          {open ? "ซ่อนตัวเลือกเขต" : "เลือกเขต"}
        </Button>
        {value ? (
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
              กรองตามเขตนี้
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
