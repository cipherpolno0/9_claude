"use client";

import { useMemo, useState } from "react";

import { selectClass } from "@/components/form";
import { Label } from "@/components/ui/label";
import { LEVEL_LABEL, ORG_LEVELS, SECTS, SECT_LABEL, type OrgLevel, type OrgUnit, type Sect } from "@/lib/org-units";

/**
 * ตัวเลือกเขตปกครองแบบไล่ชั้น: นิกาย > ภาค > จังหวัด > อำเภอ > ตำบล
 * ค่าที่ส่งกับฟอร์ม (name) คือหน่วยชั้นล่างสุดที่เลือก หยุดที่ชั้นใดก็ได้
 */
export function OrgUnitPicker({
  units,
  name,
  defaultValue,
  required,
}: {
  units: OrgUnit[];
  name: string;
  defaultValue?: string | null;
  required?: boolean;
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

  const [sect, setSect] = useState<Sect | "">(() => (initial[0] ? (byId.get(initial[0])?.sect ?? "") : ""));
  const [path, setPath] = useState<string[]>(initial);

  const levels = ORG_LEVELS.filter((l) => l !== "central") as Exclude<OrgLevel, "central">[];
  const value = path[path.length - 1] ?? "";

  const optionsFor = (index: number) => {
    const level = levels[index];
    if (index === 0) return units.filter((u) => u.is_active && u.level === level && u.sect === sect);
    const parentId = path[index - 1];
    return parentId ? units.filter((u) => u.is_active && u.level === level && u.parent_id === parentId) : [];
  };

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
            setSect(e.target.value as Sect | "");
            setPath([]);
          }}
        >
          <option value="">-- เลือกนิกาย --</option>
          {SECTS.map((s) => (
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
    </div>
  );
}
