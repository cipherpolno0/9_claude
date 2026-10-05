import "server-only";

import { cookies } from "next/headers";

import { isUuid } from "@/lib/persons-server";
import type { AttemptKind, ChoiceKey, CourseLevel, CourseStage, CourseSubject, LessonBlock } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";

/**
 * ฝั่งผู้เรียน (หน้าสาธารณะ /quiz): อ่านและเขียนผ่านฟังก์ชันฐานข้อมูล quiz_... เท่านั้น
 * ฟังก์ชันชุดนี้ไม่คืนข้อถูกหรือเฉลยก่อนส่งคำตอบ จึงห้ามอ่านตาราง questions ตรงจากไฟล์นี้
 * เจ้าของความคืบหน้า = ผู้ใช้ที่ล็อกอิน หรือรหัสอุปกรณ์ในคุกกี้ quiz_device (ออกโดย src/proxy.ts)
 */

export const QUIZ_DEVICE_COOKIE = "quiz_device";

/** รหัสอุปกรณ์ของผู้เรียน (null ถ้ายังไม่มีคุกกี้) */
export async function quizDevice(): Promise<string | null> {
  const value = (await cookies()).get(QUIZ_DEVICE_COOKIE)?.value ?? "";
  return isUuid(value) ? value : null;
}

/** ล็อกอินอยู่หรือไม่ (ใช้แสดงข้อความเรื่องการเก็บประวัติ) */
export async function isSignedIn(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user);
}

export type CourseUnitRow = {
  course_id: string;
  course_name: string;
  has_mcq: boolean;
  question_total: number;
  unit_id: string | null;
  unit_name: string | null;
  unit_order: number | null;
  lesson_count: number | null;
  question_count: number | null;
  pre_done: boolean;
  post_done: boolean;
  last_post_score: number | null;
  last_post_total: number | null;
};

export async function fetchCourseUnits(course: { level: CourseLevel; stage: CourseStage; subject: CourseSubject }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quiz_course_units", {
    p_level: course.level,
    p_stage: course.stage,
    p_subject: course.subject,
    p_device: await quizDevice(),
  });
  if (error) throw error;
  return (data as CourseUnitRow[] | null) ?? [];
}

export type FullState = {
  question_total: number;
  per_quiz: number;
  minutes: number;
  open_id: string | null;
  open_seconds_left: number | null;
  open_answered: number | null;
  open_total: number | null;
  last_id: string | null;
  last_score: number | null;
  last_total: number | null;
  done_count: number;
};

export async function fetchFullState(courseId: string): Promise<FullState | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_full_state", { p_course: courseId, p_device: await quizDevice() });
  return (data as FullState[] | null)?.[0] ?? null;
}

export type UnitState = {
  unit_id: string;
  unit_name: string;
  course_id: string;
  course_name: string;
  level: CourseLevel;
  stage: CourseStage;
  subject: CourseSubject;
  has_mcq: boolean;
  question_count: number;
  lesson_count: number;
  per_quiz: number;
  pre_id: string | null;
  pre_submitted: boolean | null;
  pre_score: number | null;
  pre_total: number | null;
  pre_answered: number | null;
  lessons_opened: boolean | null;
  post_id: string | null;
  post_submitted: boolean | null;
  post_score: number | null;
  post_total: number | null;
  post_answered: number | null;
  post_done_count: number;
  best_post_score: number | null;
};

export async function fetchUnitState(unitId: string): Promise<UnitState | null> {
  if (!isUuid(unitId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_unit_state", { p_unit: unitId, p_device: await quizDevice() });
  return (data as UnitState[] | null)?.[0] ?? null;
}

export type LearnLesson = { id: string; title: string; blocks: LessonBlock[]; sort_order: number; wrong_count: number };

/** บทเรียนของหน่วย (เรียงหัวข้อที่ตอบผิดไว้บนสุด) ได้รายการว่างถ้ายังไม่ถึงขั้นนี้ การเรียกครั้งแรกจะบันทึกว่าเปิดบทเรียนแล้ว */
export async function fetchUnitLessons(unitId: string): Promise<LearnLesson[]> {
  if (!isUuid(unitId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_unit_lessons", { p_unit: unitId, p_device: await quizDevice() });
  return ((data as LearnLesson[] | null) ?? []).map((l) => ({ ...l, blocks: Array.isArray(l.blocks) ? l.blocks : [] }));
}

export type Attempt = {
  id: string;
  kind: AttemptKind;
  course_id: string;
  course_name: string;
  level: CourseLevel;
  stage: CourseStage;
  subject: CourseSubject;
  unit_id: string | null;
  unit_name: string | null;
  total: number;
  answers: Record<string, ChoiceKey>;
  started_at: string;
  submitted_at: string | null;
  expires_at: string | null;
  seconds_left: number | null;
  score: number | null;
  duration_seconds: number | null;
};

export type AttemptQuestion = {
  position: number;
  question_id: string;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  /** มีค่าเฉพาะผลของการทดสอบรวม */
  unit_name: string | null;
  /** มีค่าเฉพาะหลังส่งคำตอบของแบบทดสอบหลังเรียนและการทดสอบรวม */
  correct_choice: ChoiceKey | null;
  explanation: string | null;
};

/** การทำแบบทดสอบพร้อมโจทย์ (null ถ้าไม่พบ หรือไม่ใช่ของผู้เรียก) */
export async function fetchAttempt(id: string): Promise<{ attempt: Attempt; questions: AttemptQuestion[] } | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const device = await quizDevice();
  // ต้องอ่านสถานะก่อน เพราะชุดที่หมดเวลาแล้วจะถูกตรวจและปิดในขั้นนี้ แล้วจึงอ่านโจทย์ (ซึ่งมีเฉลยเมื่อปิดแล้ว)
  const { data: rows } = await supabase.rpc("quiz_attempt", { p_attempt: id, p_device: device });
  const attempt = (rows as Attempt[] | null)?.[0];
  if (!attempt) return null;
  const { data: questions } = await supabase.rpc("quiz_attempt_questions", { p_attempt: id, p_device: device });
  return { attempt: { ...attempt, answers: attempt.answers ?? {} }, questions: (questions as AttemptQuestion[] | null) ?? [] };
}

export type HistoryRow = {
  id: string;
  kind: AttemptKind;
  course_name: string;
  level: CourseLevel;
  stage: CourseStage;
  subject: CourseSubject;
  unit_id: string | null;
  unit_name: string | null;
  score: number;
  total: number;
  submitted_at: string;
  duration_seconds: number | null;
};

/** ประวัติการทำแบบทดสอบของผู้ที่ล็อกอิน */
export async function fetchMyQuizHistory(): Promise<HistoryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_my_history", { p_limit: 200 });
  return (data as HistoryRow[] | null) ?? [];
}

// ------------------------------------------------------------------
// ผลคะแนนและความคืบหน้า (บทที่ 14)
// ------------------------------------------------------------------

export type UnitResult = {
  unit_id: string;
  unit_name: string;
  course_name: string;
  level: CourseLevel;
  stage: CourseStage;
  subject: CourseSubject;
  pre_id: string;
  pre_score: number;
  pre_total: number;
  pre_submitted_at: string;
  post_id: string | null;
  post_score: number | null;
  post_total: number | null;
  post_submitted_at: string | null;
  post_done_count: number;
  best_post_score: number | null;
  best_post_total: number | null;
};

/** สรุปผลของหน่วย: ก่อนเรียนครั้งล่าสุดที่ส่งแล้ว เทียบหลังเรียนครั้งล่าสุดของรอบนั้น (null = ยังไม่เคยส่งก่อนเรียน) */
export async function fetchUnitResult(unitId: string): Promise<UnitResult | null> {
  if (!isUuid(unitId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_unit_result", { p_unit: unitId, p_device: await quizDevice() });
  return (data as UnitResult[] | null)?.[0] ?? null;
}

export type WeakLesson = {
  /** null = ข้อที่ไม่ได้ผูกกับบทเรียน */
  lesson_id: string | null;
  title: string | null;
  pre_asked: number;
  pre_wrong: number;
  post_asked: number;
  post_wrong: number;
};

export async function fetchUnitWeakLessons(unitId: string): Promise<WeakLesson[]> {
  if (!isUuid(unitId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_unit_weak_lessons", { p_unit: unitId, p_device: await quizDevice() });
  return (data as WeakLesson[] | null) ?? [];
}

export type CourseProgress = {
  course_id: string;
  course_name: string;
  level: CourseLevel;
  stage: CourseStage;
  subject: CourseSubject;
  has_mcq: boolean;
  unit_total: number;
  unit_started: number;
  unit_done: number;
  post_avg_percent: number | null;
  full_count: number;
  full_best_percent: number | null;
  last_activity: string | null;
};

/** ความคืบหน้าของผู้ที่ล็อกอินในทุกรายวิชาที่มีข้อสอบให้ทำ หรือที่เคยทำ */
export async function fetchMyProgress(): Promise<CourseProgress[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_my_progress");
  return (data as CourseProgress[] | null) ?? [];
}
