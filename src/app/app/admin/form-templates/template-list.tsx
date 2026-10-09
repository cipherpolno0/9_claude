"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/errors";
import { EXAM_TYPE_LABEL, EXAM_TYPES, templateLabel, type FormTemplate, type TitleOption } from "@/lib/exam-forms";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { addTitleOption, copyFormTemplate, setFormTemplateActive, updateTitleOption } from "./actions";

function useRunner() {
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) =>
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await fn();
      if (result.ok) {
        setFlash(result.message ?? null);
        after?.(result);
      } else setError(result.error);
    });
  return { flash, error, pending, run };
}

export function TemplateList({ templates }: { templates: FormTemplate[] }) {
  const router = useRouter();
  const { flash, error, pending, run } = useRunner();

  return (
    <div className="mt-6 rounded-xl border bg-card p-5" data-testid="template-list">
      <h2 className="text-xl font-bold text-primary">แบบฟอร์ม</h2>
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>
      <ul className="mt-3 flex flex-col divide-y">
        {templates.map((t) => (
          <li key={t.id} className={cn("py-3", !t.is_active && "opacity-70")} data-testid="template-row" data-code={t.code}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="text-lg font-semibold">{templateLabel(t)}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  รุ่น {t.version || "-"} · แผ่นงาน {t.sheet_name} · {t.columns.length} คอลัมน์
                </span>
              </span>
              <span
                className={cn(
                  "rounded-full px-3 py-0.5 text-sm font-semibold",
                  t.is_active ? "bg-green-100 text-green-900" : "bg-muted text-muted-foreground",
                )}
              >
                {t.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">แก้ไขล่าสุด {thaiDateTime(t.updated_at ?? null)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/app/admin/form-templates/${t.id}`}
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-secondary"
              >
                แก้ไข
              </Link>
              <a
                href={`/app/admin/form-templates/${t.id}/template`}
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-secondary"
              >
                ดาวน์โหลดแม่แบบเปล่า
              </a>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () => copyFormTemplate(t.id),
                    (r) => {
                      const id = (r as { id?: string }).id;
                      if (id) router.push(`/app/admin/form-templates/${id}`);
                    },
                  )
                }
              >
                คัดลอกเป็นแบบใหม่
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  const q = t.is_active
                    ? `ปิดใช้งาน ${templateLabel(t)} ใช่หรือไม่ ระหว่างนี้ดาวน์โหลดแม่แบบของประเภทและชั้นนี้ไม่ได้ จนกว่าจะเปิดแบบใหม่`
                    : `เปิดใช้งาน ${templateLabel(t)} ใช่หรือไม่`;
                  if (window.confirm(q)) run(() => setFormTemplateActive(t.id, !t.is_active));
                }}
              >
                {t.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** รายการคำนำหน้าชื่อ (แยกนักธรรมกับธรรมศึกษา) ใช้เป็นรายการให้เลือกในช่อง คำนำหน้าชื่อ ของแม่แบบ */
export function TitleOptionsManager({ options }: { options: TitleOption[] }) {
  const { flash, error, pending, run } = useRunner();
  const [newNames, setNewNames] = useState<Record<string, string>>({});

  return (
    <div className="mt-6 rounded-xl border bg-card p-5" data-testid="title-options">
      <h2 className="text-xl font-bold text-primary">รายการคำนำหน้าชื่อ</h2>
      <p className="text-muted-foreground">
        ไฟล์จริงไม่มีรายการคำนำหน้าให้เลือก ผู้ดูแลระบบกรอกเองได้ที่นี่ ถ้ายังไม่มีรายการ ช่องคำนำหน้าในแม่แบบจะเป็นช่องพิมพ์เองเหมือนไฟล์จริง
        ถ้ามีรายการ ผู้กรอกเลือกจากรายการได้ และยังพิมพ์คำนำหน้าเต็มที่ไม่อยู่ในรายการได้ (ระบบเตือนให้ตรวจ)
      </p>
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {EXAM_TYPES.map((type) => {
          const list = options.filter((o) => o.exam_type === type);
          const next = (list.length ? Math.max(...list.map((o) => o.sort_order ?? 0)) : 0) + 10;
          return (
            <div key={type} className="rounded-lg border p-4" data-testid={`titles-${type}`}>
              <h3 className="font-bold">{EXAM_TYPE_LABEL[type]}</h3>
              {list.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีรายการ</p> : null}
              <ul className="mt-2 flex flex-col gap-1">
                {list.map((o, i) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2" data-testid="title-option">
                    <span className={cn("min-w-24 flex-1", o.is_active === false && "text-muted-foreground line-through")}>
                      {o.name}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending || i === 0}
                      aria-label={`เลื่อน ${o.name} ขึ้น`}
                      onClick={() =>
                        run(async () => {
                          const prev = list[i - 1];
                          const first = await updateTitleOption(o.id!, { sortOrder: prev.sort_order ?? 0 });
                          if (!first.ok) return first;
                          const mine = o.sort_order ?? 0;
                          return updateTitleOption(prev.id!, {
                            sortOrder: mine === (prev.sort_order ?? 0) ? mine + 1 : mine,
                          });
                        })
                      }
                    >
                      เลื่อนขึ้น
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => updateTitleOption(o.id!, { isActive: o.is_active === false }))}
                    >
                      {o.is_active === false ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                    </Button>
                  </li>
                ))}
              </ul>
              <form
                className="mt-3 flex gap-2 border-t pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => addTitleOption(type, newNames[type] ?? "", next),
                    () => setNewNames((v) => ({ ...v, [type]: "" })),
                  );
                }}
              >
                <Input
                  aria-label={`เพิ่มคำนำหน้า ${EXAM_TYPE_LABEL[type]}`}
                  maxLength={60}
                  value={newNames[type] ?? ""}
                  placeholder="คำนำหน้าเต็ม"
                  onChange={(e) => setNewNames((v) => ({ ...v, [type]: e.target.value }))}
                />
                <Button type="submit" disabled={pending || !(newNames[type] ?? "").trim()}>
                  เพิ่ม
                </Button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
