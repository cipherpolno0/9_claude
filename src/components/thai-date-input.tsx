"use client";

import { useState } from "react";

import { selectClass } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoFromThaiParts } from "@/lib/persons";
import { cn } from "@/lib/utils";

/**
 * ช่องกรอกวันที่แบบไทย: วัน / เดือน / ปี พ.ศ.
 * ค่าที่ส่งกับฟอร์ม (name) เป็น YYYY-MM-DD  ถ้ากรอกไม่ครบหรือไม่ใช่วันที่จริงจะส่งค่าว่าง
 * และส่ง name_incomplete = 1 เพื่อให้ฝั่งเซิร์ฟเวอร์แจ้งผู้ใช้ได้
 */

export const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export function ThaiDateInput({
  label,
  name,
  defaultValue,
  required,
  hint,
  className,
}: {
  label: string;
  name: string;
  /** YYYY-MM-DD */
  defaultValue?: string | null;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  const initial = defaultValue?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const [day, setDay] = useState(initial ? String(Number(initial[3])) : "");
  const [month, setMonth] = useState(initial ? String(Number(initial[2])) : "");
  const [year, setYear] = useState(initial ? String(Number(initial[1]) + 543) : "");

  const anyFilled = day !== "" || month !== "" || year !== "";
  const iso = day && month && year.length === 4 ? isoFromThaiParts(Number(day), Number(month), Number(year)) : null;
  const incomplete = anyFilled && !iso;

  return (
    <fieldset className={cn("flex flex-col gap-1", className)}>
      <legend className="mb-1 text-base font-medium">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </legend>
      <input type="hidden" name={name} value={iso ?? ""} />
      <input type="hidden" name={`${name}_incomplete`} value={incomplete ? "1" : ""} />
      <div className="grid grid-cols-[5rem_1fr_6.5rem] gap-2">
        <div>
          <Label htmlFor={`${name}-day`} className="sr-only">
            {label}: วัน
          </Label>
          <select id={`${name}-day`} className={selectClass} value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">วัน</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${name}-month`} className="sr-only">
            {label}: เดือน
          </Label>
          <select id={`${name}-month`} className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">เดือน</option>
            {THAI_MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${name}-year`} className="sr-only">
            {label}: ปี พ.ศ.
          </Label>
          <Input
            id={`${name}-year`}
            inputMode="numeric"
            maxLength={4}
            placeholder="พ.ศ."
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
          />
        </div>
      </div>
      {incomplete ? (
        <p className="text-sm font-medium text-destructive">กรอกวัน เดือน และปี พ.ศ. 4 หลักให้ครบ และต้องเป็นวันที่ที่มีจริง</p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </fieldset>
  );
}
