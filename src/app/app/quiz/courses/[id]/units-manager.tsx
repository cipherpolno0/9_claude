"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/errors";

import { moveUnit, renameCourse, saveUnit, setUnitActive } from "../../actions";

type UnitItem = { id: string; name: string; is_active: boolean; published: number; draft: number };

const n = (value: number) => value.toLocaleString("th-TH");

/** จัดการหน่วยการเรียนของรายวิชา: เพิ่ม เปลี่ยนชื่อ เลื่อนลำดับ ปิดใช้งาน และแก้ชื่อที่แสดงของรายวิชา */
export function UnitsManager({
  courseId,
  courseName,
  hasMcq,
  units,
}: {
  courseId: string;
  courseName: string;
  hasMcq: boolean;
  units: UnitItem[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(courseName);
  const [newUnit, setNewUnit] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const active = units.filter((u) => u.is_active);
  const inactive = units.filter((u) => !u.is_active);

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="mt-6 flex flex-col gap-6">
      {result ? result.ok ? <InfoText>{result.message}</InfoText> : <ErrorText>{result.error}</ErrorText> : null}

      <div className="rounded-xl border bg-card p-5" data-testid="units-active">
        <h2 className="text-xl font-bold text-primary">หน่วยการเรียน ({n(active.length)} หน่วย)</h2>
        <p className="text-muted-foreground">ลำดับในรายการนี้คือลำดับที่ผู้เรียนจะเห็น ใช้ลูกศรเลื่อนขึ้นลง</p>
        {active.length === 0 ? <p className="mt-3 text-muted-foreground">ยังไม่มีหน่วยการเรียน เพิ่มหน่วยแรกได้ที่ช่องด้านล่าง</p> : null}
        <ol className="mt-3 flex flex-col gap-2">
          {active.map((u, i) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3" data-unit={u.name}>
              <span className="w-8 shrink-0 text-center font-bold text-muted-foreground">{n(i + 1)}</span>
              {editing?.id === u.id ? (
                <form
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => saveUnit(courseId, u.id, editing.name), () => setEditing(null));
                  }}
                >
                  <Input
                    aria-label={`ชื่อใหม่ของหน่วย ${u.name}`}
                    className="min-w-0 flex-1"
                    value={editing.name}
                    onChange={(e) => setEditing({ id: u.id, name: e.target.value })}
                    autoFocus
                  />
                  <Button type="submit" disabled={pending}>
                    บันทึกชื่อ
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    ยกเลิก
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{u.name}</p>
                    {hasMcq ? (
                      <p className="text-sm text-muted-foreground">
                        <Link href={`/app/quiz/questions?f_course=${courseId}&f_unit=${u.id}`} className="underline underline-offset-4">
                          ข้อสอบเผยแพร่แล้ว {n(u.published)} ข้อ · ร่าง {n(u.draft)} ข้อ
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`เลื่อน ${u.name} ขึ้น`}
                    disabled={pending || i === 0}
                    onClick={() => run(() => moveUnit(u.id, "up"))}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`เลื่อน ${u.name} ลง`}
                    disabled={pending || i === active.length - 1}
                    onClick={() => run(() => moveUnit(u.id, "down"))}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button type="button" variant="outline" disabled={pending} onClick={() => setEditing({ id: u.id, name: u.name })}>
                    เปลี่ยนชื่อ
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`ปิดใช้งานหน่วย "${u.name}" ใช่หรือไม่ (ข้อมูลไม่ถูกลบ และเปิดใช้งานใหม่ได้)`)) return;
                      run(() => setUnitActive(u.id, false));
                    }}
                  >
                    ปิดใช้งาน
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>

        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveUnit(courseId, null, newUnit), () => setNewUnit(""));
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="new-unit">เพิ่มหน่วยการเรียน</Label>
            <Input id="new-unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="ชื่อหน่วย" />
          </div>
          <Button type="submit" disabled={pending || !newUnit.trim()}>
            เพิ่มหน่วย
          </Button>
        </form>
      </div>

      {inactive.length > 0 ? (
        <div className="rounded-xl border bg-card p-5" data-testid="units-inactive">
          <h2 className="text-xl font-bold text-primary">หน่วยที่ปิดใช้งาน ({n(inactive.length)} หน่วย)</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {inactive.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-muted-foreground">
                <span className="min-w-0 flex-1">{u.name}</span>
                <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setUnitActive(u.id, true))}>
                  เปิดใช้งาน
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        className="rounded-xl border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => renameCourse(courseId, name));
        }}
      >
        <h2 className="text-xl font-bold text-primary">ชื่อรายวิชาที่แสดง</h2>
        <p className="text-muted-foreground">แก้ได้เฉพาะชื่อที่แสดง ส่วนรหัส ชั้น ช่วงชั้น และวิชา เป็นโครงสร้างตายตัว</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="course-name">ชื่อรายวิชา</Label>
            <Input id="course-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={pending || !name.trim() || name.trim() === courseName}>
            บันทึกชื่อรายวิชา
          </Button>
        </div>
      </form>
    </div>
  );
}
