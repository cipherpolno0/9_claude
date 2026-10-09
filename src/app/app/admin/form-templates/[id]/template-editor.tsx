"use client";

import { useRef, useState, useTransition } from "react";

import { ErrorText, InfoText, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COLUMN_TYPE_LABEL,
  COLUMN_TYPES,
  columnLetter,
  columnsProblem,
  sheetNameProblem,
  type ColumnType,
  type FormColumn,
  type FormTemplate,
} from "@/lib/exam-forms";

import { saveFormTemplate } from "../actions";

type Row = FormColumn & { uid: number };


function TextField({
  id,
  label,
  value,
  onChange,
  maxLength,
  hint,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input id={id} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step ?? 1}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </div>
  );
}

/** แก้ไขแบบฟอร์ม: ข้อมูลแฟ้ม และรายการคอลัมน์ (เพิ่ม ลบ เลื่อน ชนิดข้อมูล บังคับกรอก กฎตรวจ คำแนะนำ) */
export function TemplateEditor({ template }: { template: FormTemplate }) {
  const [info, setInfo] = useState({
    code: template.code,
    sheet_name: template.sheet_name,
    title: template.title,
    notice: template.notice,
    version: template.version,
    marker_code: template.marker_code,
    marker_no: template.marker_no,
  });
  // รหัสแถวต้องเหมือนกันทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ (ใช้ลำดับเดิม แถวที่เพิ่มใหม่นับต่อ)
  const [rows, setRows] = useState<Row[]>(() => template.columns.map((c, i) => ({ ...c, uid: i })));
  const nextUid = useRef(template.columns.length);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (uid: number, patch: Partial<FormColumn>) =>
    setRows((list) => list.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  const save = () => {
    const columns = rows.map((r) => {
      const c: FormColumn & { uid?: number } = { ...r };
      delete c.uid;
      return c.type === "list" ? { ...c, options: (c.options ?? []).filter((o) => o.trim()) } : c;
    });
    const problem = sheetNameProblem(info.sheet_name) ?? columnsProblem(columns);
    setFlash(null);
    if (problem) {
      setError(problem);
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await saveFormTemplate(template.id, { ...info, columns });
      if (result.ok) setFlash(result.message ?? null);
      else setError(result.error);
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-4" data-testid="template-editor">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ข้อมูลแฟ้ม</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <TextField id="code" label="รหัสแบบ" value={info.code} maxLength={20} onChange={(v) => setInfo({ ...info, code: v })} />
          <TextField
            id="sheet_name"
            label="ชื่อแผ่นงาน"
            value={info.sheet_name}
            maxLength={31}
            onChange={(v) => setInfo({ ...info, sheet_name: v })}
          />
          <TextField id="version" label="รุ่นของแบบ (แถว 1)" value={info.version} maxLength={30} onChange={(v) => setInfo({ ...info, version: v })} />
          <TextField
            id="title"
            label="ชื่อบัญชี (แถว 3)"
            value={info.title}
            maxLength={200}
            onChange={(v) => setInfo({ ...info, title: v })}
            className="sm:col-span-3"
          />
          <div className="sm:col-span-3">
            <Label htmlFor="notice" className="text-sm">
              ข้อความเตือน (แถว 2)
            </Label>
            <textarea
              id="notice"
              rows={2}
              maxLength={500}
              value={info.notice}
              onChange={(e) => setInfo({ ...info, notice: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </div>
          <TextField
            id="marker_code"
            label="รหัสแฟ้ม (แถว 1 ช่อง A)"
            value={info.marker_code}
            maxLength={20}
            onChange={(v) => setInfo({ ...info, marker_code: v })}
            hint="ตัวอักษรสีขาวในไฟล์จริง คงไว้ตามต้นฉบับ"
          />
          <NumberField
            id="marker_no"
            label="เลขแฟ้ม (แถว 1 ช่อง B)"
            value={info.marker_no ?? undefined}
            onChange={(v) => setInfo({ ...info, marker_no: v ?? null })}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">คอลัมน์ ({rows.length})</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {rows.map((c, i) => {
            const p = `c${c.uid}`;
            return (
              <li key={c.uid} className="rounded-lg border p-4" data-testid="column-row" data-key={c.key}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    คอลัมน์ {columnLetter(i + 1)}: {c.label || "(ยังไม่มีชื่อ)"}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>
                      เลื่อนซ้าย
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                      เลื่อนขวา
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`นำคอลัมน์ ${c.label || columnLetter(i + 1)} ออกจากแบบใช่หรือไม่`)) {
                          setRows((list) => list.filter((r) => r.uid !== c.uid));
                        }
                      }}
                    >
                      นำออก
                    </Button>
                  </span>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-4">
                  <TextField id={`${p}-label`} label="ชื่อคอลัมน์" value={c.label} maxLength={100} onChange={(v) => update(c.uid, { label: v })} className="sm:col-span-2" />
                  <TextField id={`${p}-key`} label="รหัสคอลัมน์ (อังกฤษ)" value={c.key} maxLength={40} onChange={(v) => update(c.uid, { key: v })} />
                  <div>
                    <Label htmlFor={`${p}-type`} className="text-sm">
                      ชนิดข้อมูล
                    </Label>
                    <select
                      id={`${p}-type`}
                      className={selectClass}
                      value={c.type}
                      onChange={(e) => {
                        const type = e.target.value as ColumnType;
                        update(c.uid, {
                          type,
                          ...(type === "list" && !c.options?.length ? { options: [] } : {}),
                          ...((type === "number" || type === "year") && c.min === undefined ? { min: type === "year" ? 2500 : 1, max: type === "year" ? 2600 : 1000 } : {}),
                        });
                      }}
                    >
                      {COLUMN_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {COLUMN_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TextField id={`${p}-top`} label="หัวตารางบรรทัดบน (แถว 7)" value={c.top} maxLength={200} onChange={(v) => update(c.uid, { top: v })} className="sm:col-span-2" />
                  <NumberField id={`${p}-span`} label="หัวบรรทัดบนรวมกี่คอลัมน์" value={c.top_span} onChange={(v) => update(c.uid, { top_span: v ?? 1 })} />
                  <TextField id={`${p}-bottom`} label="หัวตารางบรรทัดล่าง (แถว 8)" value={c.bottom} maxLength={200} onChange={(v) => update(c.uid, { bottom: v })} />
                  <label className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={c.required}
                      onChange={(e) => update(c.uid, { required: e.target.checked })}
                    />
                    บังคับกรอก
                  </label>
                  <NumberField id={`${p}-width`} label="ความกว้าง" value={c.width} step={0.1} onChange={(v) => update(c.uid, { width: v ?? 10 })} />
                  {c.type === "number" || c.type === "year" ? (
                    <>
                      <NumberField id={`${p}-min`} label="ค่าต่ำสุด" value={c.min} onChange={(v) => update(c.uid, { min: v })} />
                      <NumberField id={`${p}-max`} label="ค่าสูงสุด" value={c.max} onChange={(v) => update(c.uid, { max: v })} />
                    </>
                  ) : null}
                  {c.type === "list" ? (
                    <TextField
                      id={`${p}-options`}
                      label="รายการให้เลือก (คั่นด้วยจุลภาค)"
                      value={(c.options ?? []).join(",")}
                      maxLength={2000}
                      onChange={(v) => update(c.uid, { options: v.split(",").map((s) => s.trim()) })}
                      className="sm:col-span-2"
                    />
                  ) : null}
                  <TextField id={`${p}-help_title`} label="หัวข้อคำแนะนำ (ไม่เกิน 32)" value={c.help_title ?? ""} maxLength={32} onChange={(v) => update(c.uid, { help_title: v })} />
                  <TextField id={`${p}-help`} label="คำแนะนำเมื่อเลือกช่อง" value={c.help ?? ""} maxLength={255} onChange={(v) => update(c.uid, { help: v })} className="sm:col-span-3" />
                  <TextField id={`${p}-header_help`} label="คำแนะนำที่หัวตาราง" value={c.header_help ?? ""} maxLength={255} onChange={(v) => update(c.uid, { header_help: v })} className="sm:col-span-2" />
                  <TextField id={`${p}-example`} label="ตัวอย่าง (ข้อมูลสมมุติ)" value={c.example ?? ""} maxLength={200} onChange={(v) => update(c.uid, { example: v })} className="sm:col-span-2" />
                </div>
              </li>
            );
          })}
        </ol>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={rows.length >= 40}
          onClick={() =>
            setRows((list) => [
              ...list,
              {
                key: `col_${list.length + 1}`,
                label: "",
                top: "",
                top_span: 1,
                bottom: "",
                type: "text",
                required: false,
                width: 12,
                uid: nextUid.current++,
              },
            ])
          }
        >
          เพิ่มคอลัมน์ท้ายสุด
        </Button>
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
        {flash ? <InfoText>{flash}</InfoText> : null}
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "กำลังบันทึก..." : "บันทึกแบบฟอร์ม"}
          </Button>
          <a href={`/app/admin/form-templates/${template.id}/template`} className="inline-flex h-11 items-center px-3 text-primary underline underline-offset-4">
            ดาวน์โหลดแม่แบบเปล่าเพื่อตรวจ (ค่าที่บันทึกแล้ว)
          </a>
        </div>
      </div>
    </div>
  );
}
