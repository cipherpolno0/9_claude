"use client";

import Link from "next/link";
import { useState } from "react";

import { Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CHOICE_KEYS,
  CHOICE_LABEL,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  type ChoiceKey,
  type Course,
  type Difficulty,
  type Unit,
} from "@/lib/quiz";

import { saveQuestion } from "../actions";
import { QuestionPreview } from "./question-preview";

export type QuestionFormValue = {
  id: string;
  course_id: string;
  unit_id: string;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: ChoiceKey | "";
  explanation: string;
  source_year_be: number | null;
  difficulty: Difficulty;
};

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** ฟอร์มเพิ่มและแก้ไขข้อสอบ (ไม่ส่ง id = เพิ่มใหม่) มีตัวอย่างตามที่ผู้เรียนจะเห็นอยู่ด้านล่าง */
export function QuestionForm({
  question,
  courses,
  units,
  backHref,
}: {
  question: QuestionFormValue;
  /** เฉพาะรายวิชาที่มีข้อสอบปรนัย */
  courses: Course[];
  /** หน่วยที่ใช้งานของทุกรายวิชา (และหน่วยเดิมของข้อที่กำลังแก้ไข) */
  units: Unit[];
  backHref: string;
}) {
  const { state, onSubmit, pending } = useServerForm(saveQuestion);
  const [courseId, setCourseId] = useState(question.course_id);
  const [unitId, setUnitId] = useState(question.unit_id);
  const [text, setText] = useState(question.question_text);
  const [choices, setChoices] = useState<Record<ChoiceKey, string>>({
    a: question.choice_a,
    b: question.choice_b,
    c: question.choice_c,
    d: question.choice_d,
  });
  const [correct, setCorrect] = useState<ChoiceKey | "">(question.correct_choice);
  const [explanation, setExplanation] = useState(question.explanation);
  const courseUnits = units.filter((u) => u.course_id === courseId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="id" value={question.id} />

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">รายวิชาและหน่วย</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="course_id">
              รายวิชา<span className="text-destructive"> *</span>
            </Label>
            <select
              id="course_id"
              name="course_id"
              className={selectClass}
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setUnitId("");
              }}
            >
              <option value="">-- เลือกรายวิชา --</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">วิชากระทู้ธรรมเป็นข้อเขียน จึงไม่มีในรายการนี้</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="unit_id">
              หน่วยการเรียน<span className="text-destructive"> *</span>
            </Label>
            <select
              id="unit_id"
              name="unit_id"
              className={selectClass}
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!courseId}
            >
              <option value="">{courseId ? "-- เลือกหน่วย --" : "-- เลือกรายวิชาก่อน --"}</option>
              {courseUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.is_active ? u.name : `${u.name} (ปิดใช้งาน)`}
                </option>
              ))}
            </select>
            {courseId && courseUnits.length === 0 ? (
              <p className="text-sm text-destructive">
                รายวิชานี้ยังไม่มีหน่วยการเรียน{" "}
                <Link href={`/app/quiz/courses/${courseId}`} className="underline underline-offset-4">
                  เพิ่มหน่วยก่อน
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">โจทย์และตัวเลือก</h2>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="question_text">
              โจทย์<span className="text-destructive"> *</span>
            </Label>
            <textarea
              id="question_text"
              name="question_text"
              className={textareaClass}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-base font-medium">
              ตัวเลือก 4 ข้อ และข้อถูก<span className="text-destructive"> *</span>
            </legend>
            {CHOICE_KEYS.map((key) => (
              <div key={key} className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                <Label htmlFor={`choice_${key}`} className="w-6 shrink-0 text-lg font-bold">
                  {CHOICE_LABEL[key]}
                </Label>
                <Input
                  id={`choice_${key}`}
                  name={`choice_${key}`}
                  className="min-w-0 flex-1"
                  value={choices[key]}
                  onChange={(e) => setChoices((c) => ({ ...c, [key]: e.target.value }))}
                />
                <label className="flex min-h-11 shrink-0 items-center gap-2">
                  <input
                    type="radio"
                    name="correct_choice"
                    value={key}
                    checked={correct === key}
                    onChange={() => setCorrect(key)}
                    className="size-5 accent-[var(--primary)]"
                  />
                  ข้อถูก
                </label>
              </div>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1">
            <Label htmlFor="explanation">คำอธิบายเฉลย</Label>
            <textarea
              id="explanation"
              name="explanation"
              className={textareaClass}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">ผู้เรียนจะเห็นหลังตอบแล้ว (เว้นว่างได้)</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ที่มาและความยาก</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label="ที่มา: ปี พ.ศ. ของข้อสอบสนามหลวง"
            name="source_year_be"
            inputMode="numeric"
            defaultValue={question.source_year_be ?? ""}
            hint="เช่น 2567 (เว้นว่างได้ถ้าไม่ใช่ข้อสอบสนามหลวง)"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="difficulty">ระดับความยาก</Label>
            <select id="difficulty" name="difficulty" className={selectClass} defaultValue={question.difficulty}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <QuestionPreview question={text} choices={choices} correct={correct} explanation={explanation} />

      <FormMessages state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
          {question.id ? "บันทึกการแก้ไข" : "บันทึกเป็นฉบับร่าง"}
        </SubmitButton>
        <Button asChild variant="outline">
          <Link href={backHref}>ยกเลิก</Link>
        </Button>
      </div>
    </form>
  );
}
