"use client";

import { useRouter } from "next/navigation";

import { selectClass } from "@/components/form";
import { Label } from "@/components/ui/label";

/** ตัวกรองรายวิชาของสถิติรายข้อ (เปลี่ยนแล้วไปที่อยู่ ?course= ทันที) */
export function StatsCourseFilter({ courses, value }: { courses: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <div className="flex max-w-xl flex-col gap-1">
      <Label htmlFor="stats-course">รายวิชา</Label>
      <select
        id="stats-course"
        className={selectClass}
        value={value}
        onChange={(e) => router.push(`/app/quiz/stats${e.target.value ? `?course=${e.target.value}` : ""}`, { scroll: false })}
      >
        <option value="">ทุกรายวิชา</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
