"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { selectClass } from "@/components/form";
import { FISCAL_STATUS_LABEL, type FiscalYear } from "@/lib/budget";

/** เลือกปีงบประมาณ (เปลี่ยนแล้วโหลดหน้าใหม่ด้วย ?year= คงหน่วยเดิมไว้) */
export function YearSelect({ years, value, unitId }: { years: FiscalYear[]; value: number | null; unitId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-xl border bg-card p-4">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">ปีงบประมาณ</span>
        <select
          className={selectClass}
          value={value ?? ""}
          disabled={pending}
          data-testid="year-select"
          onChange={(e) => {
            const next = new URLSearchParams(searchParams.toString());
            next.set("year", e.target.value);
            next.set("unit", unitId);
            startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
          }}
        >
          {years.map((y) => (
            <option key={y.id} value={y.year_be}>
              {y.year_be} ({FISCAL_STATUS_LABEL[y.status]})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
