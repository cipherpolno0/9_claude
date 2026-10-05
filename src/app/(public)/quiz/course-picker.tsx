"use client";

import Link from "next/link";
import { useState } from "react";

import {
  COURSE_LEVELS,
  COURSE_LEVEL_LABEL,
  COURSE_STAGES,
  COURSE_STAGE_LABEL,
  COURSE_SUBJECTS,
  COURSE_SUBJECT_LABEL,
  QUIZ_BASE,
  courseSlug,
  type CourseLevel,
  type CourseStage,
} from "@/lib/quiz";
import { cn } from "@/lib/utils";

const choice =
  "flex min-h-14 items-center justify-center rounded-xl border-2 bg-card px-4 py-3 text-center text-lg font-semibold transition-colors hover:border-primary";

/** เลือกชั้น > ช่วงชั้น > วิชา (โครงสร้างรายวิชาตายตัว จึงไม่ต้องอ่านฐานข้อมูล) */
export function CoursePicker() {
  const [level, setLevel] = useState<CourseLevel | null>(null);
  const [stage, setStage] = useState<CourseStage | null>(null);

  return (
    <div className="flex flex-col gap-6" data-testid="course-picker">
      <fieldset>
        <legend className="mb-2 text-xl font-bold text-primary">1. เลือกชั้น</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {COURSE_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={cn(choice, level === l ? "border-primary bg-primary text-primary-foreground" : "border-input")}
            >
              {COURSE_LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
      </fieldset>

      {level ? (
        <fieldset>
          <legend className="mb-2 text-xl font-bold text-primary">2. เลือกช่วงชั้น</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {COURSE_STAGES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={stage === s}
                onClick={() => setStage(s)}
                className={cn(choice, stage === s ? "border-primary bg-primary text-primary-foreground" : "border-input")}
              >
                {COURSE_STAGE_LABEL[s]}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {level && stage ? (
        <div>
          <h2 className="mb-2 text-xl font-bold text-primary">3. เลือกวิชา</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COURSE_SUBJECTS.map((subject) => (
              <li key={subject}>
                <Link
                  href={`${QUIZ_BASE}/${courseSlug({ level, stage, subject })}`}
                  prefetch={false}
                  className={cn(choice, "border-input text-primary")}
                >
                  วิชา{COURSE_SUBJECT_LABEL[subject]}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">เลือกวิชาแล้ว หน้าถัดไปจะให้เลือกหน่วยการเรียน</p>
        </div>
      ) : null}
    </div>
  );
}
