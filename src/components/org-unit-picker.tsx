"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { selectClass } from "@/components/form";
import { Label } from "@/components/ui/label";
import { LEVEL_LABEL, ORG_LEVELS, SECTS, SECT_LABEL, type OrgLevel, type OrgUnit, type Sect } from "@/lib/org-units";

/**
 * ตัวเลือกเขตปกครองแบบไล่ชั้น: นิกาย > ภาค > จังหวัด > อำเภอ > ตำบล
 * ค่าที่ส่งกับฟอร์ม (name) คือหน่วยชั้นล่างสุดที่เลือก หยุดที่ชั้นใดก็ได้
 *
 * จำกัดตามสิทธิ์: ส่ง units จาก fetchAccessibleUnits() (src/lib/org-units-server.ts)
 * หน่วยที่ selectable = false เป็นหน่วยเหนือที่แสดงไว้ให้ไล่ชั้นลงมาเท่านั้น เลือกเป็นคำตอบไม่ได้
 * ชั้นที่มีตัวเลือกเดียวจะถูกเลือกให้อัตโนมัติ
 */
type PickerUnit = OrgUnit & { selectable?: boolean };

const LEVELS = ORG_LEVELS.filter((l) => l !== "central") as Exclude<OrgLevel, "central">[];

function optionsAt(units: PickerUnit[], sect: Sect | "", path: string[], index: number) {
  const level = LEVELS[index];
  if (index === 0) return units.filter((u) => u.is_active && u.level === level && u.sect === sect);
  const parentId = path[index - 1];
  return parentId ? units.filter((u) => u.is_active && u.level === level && u.parent_id === parentId) : [];
}

/** เลือกให้อัตโนมัติในชั้นที่มีตัวเลือกเดียว (เกิดเมื่อผู้ใช้มีสิทธิ์เพียงสายเดียว) */
function autoFill(units: PickerUnit[], sect: Sect | "", path: string[]) {
  const next = [...path];
  while (next.length < LEVELS.length) {
    const options = optionsAt(units, sect, next, next.length);
    if (options.length !== 1) break;
    const current = next.length > 0 ? units.find((u) => u.id === next[next.length - 1]) : undefined;
    // เลือกต่อให้เฉพาะเมื่อยังไม่ถึงหน่วยที่เลือกได้ เพื่อไม่บังคับให้ลงลึกเกินจำเป็น
    if (current && current.selectable !== false) break;
    next.push(options[0].id);
  }
  return next;
}

export function OrgUnitPicker({
  units,
  name,
  defaultValue,
  required,
  onChange,
}: {
  units: PickerUnit[];
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  /** แจ้งค่าที่เลือก (ว่าง = ยังไม่ได้เลือกหน่วยที่เลือกได้) */
  onChange?: (orgUnitId: string) => void;
}) {
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  // เส้นทางเริ่มต้นจากค่าเดิม (ไล่จากหน่วยที่เลือกขึ้นไปถึงภาค)
  const initial = useMemo(() => {
    const path: string[] = [];
    let cur = defaultValue ? byId.get(defaultValue) : undefined;
    while (cur && cur.level !== "central") {
      path.unshift(cur.id);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return path;
  }, [defaultValue, byId]);

  // ถ้ามีนิกายเดียวในรายการ ให้เลือกนิกายนั้นเลย
  const sectsInList = useMemo(
    () => SECTS.filter((s) => units.some((u) => u.sect === s && u.level !== "central")),
    [units],
  );
  const initialSect: Sect | "" = initial[0]
    ? (byId.get(initial[0])?.sect ?? "")
    : sectsInList.length === 1
      ? sectsInList[0]
      : "";

  const [sect, setSect] = useState<Sect | "">(initialSect);
  const [path, setPathState] = useState<string[]>(() =>
    initial.length > 0 ? initial : autoFill(units, initialSect, []),
  );

  const levels = LEVELS;
  const deepest = path.length > 0 ? byId.get(path[path.length - 1]) : undefined;
  const value = deepest && deepest.selectable !== false ? deepest.id : "";

  const setPath = (next: string[], nextSect: Sect | "" = sect) => {
    setPathState(autoFill(units, nextSect, next));
  };

  // แจ้งค่าที่เลือกทุกครั้งที่เปลี่ยน รวมค่าที่ระบบเลือกให้อัตโนมัติตอนเปิดหน้า
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.(value);
  }, [value]);

  const optionsFor = (index: number) => optionsAt(units, sect, path, index);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${name}-sect`}>
          นิกาย{required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <select
          id={`${name}-sect`}
          className={selectClass}
          value={sect}
          onChange={(e) => {
            const nextSect = e.target.value as Sect | "";
            setSect(nextSect);
            setPath([], nextSect);
          }}
        >
          <option value="">-- เลือกนิกาย --</option>
          {sectsInList.map((s) => (
            <option key={s} value={s}>
              {SECT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {levels.map((level, index) => {
        const options = optionsFor(index);
        const disabled = index === 0 ? !sect : !path[index - 1];
        return (
          <div key={level} className="flex flex-col gap-1">
            <Label htmlFor={`${name}-${level}`}>
              {LEVEL_LABEL[level]}
              {required && index === 0 ? <span className="text-destructive"> *</span> : null}
            </Label>
            <select
              id={`${name}-${level}`}
              className={selectClass}
              disabled={disabled}
              value={path[index] ?? ""}
              onChange={(e) => {
                const next = path.slice(0, index);
                if (e.target.value) next.push(e.target.value);
                setPath(next);
              }}
            >
              <option value="">{index === 0 ? "-- เลือก --" : "-- ไม่ระบุ (หยุดที่ชั้นบน) --"}</option>
              {options.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {deepest && deepest.selectable === false ? (
        <p className="font-medium text-destructive sm:col-span-2">
          หน่วยนี้อยู่นอกเขตที่ท่านดูแล กรุณาเลือกลงไปให้ถึงหน่วยของท่าน
        </p>
      ) : null}
    </div>
  );
}
