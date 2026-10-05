"use client";

import { useRouter } from "next/navigation";

import { selectClass } from "@/components/form";
import { Label } from "@/components/ui/label";

type Option = { id: string; name: string };

/** เลือกรายวิชาและหน่วยของหน้าบทเรียน (เปลี่ยนแล้วไปที่อยู่ ?course= &unit= ทันที) */
export function LessonScopePicker({
  courses,
  units,
  courseId,
  unitId,
}: {
  courses: Option[];
  units: Option[];
  courseId: string;
  unitId: string;
}) {
  const router = useRouter();
  const go = (course: string, unit: string) => {
    const params = new URLSearchParams();
    if (course) params.set("course", course);
    if (course && unit) params.set("unit", unit);
    const query = params.toString();
    router.push(`/app/quiz/lessons${query ? `?${query}` : ""}`);
  };

  return (
    <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="lesson-course">รายวิชา</Label>
        <select id="lesson-course" className={selectClass} value={courseId} onChange={(e) => go(e.target.value, "")}>
          <option value="">-- เลือกรายวิชา --</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lesson-unit">หน่วยการเรียน</Label>
        <select
          id="lesson-unit"
          className={selectClass}
          value={unitId}
          onChange={(e) => go(courseId, e.target.value)}
          disabled={!courseId}
        >
          <option value="">{courseId ? "-- ทุกหน่วย (ดูจำนวนบทเรียน) --" : "-- เลือกรายวิชาก่อน --"}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
