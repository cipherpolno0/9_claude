"use server";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/form";
import { explainError, type ActionResult } from "@/lib/errors";
import { isUuid } from "@/lib/persons-server";
import { ATTEMPT_KINDS, QUIZ_BASE, isChoiceKey } from "@/lib/quiz";
import { QUIZ_DEVICE_COOKIE, quizDevice } from "@/lib/quiz-learn-server";
import { createClient } from "@/lib/supabase/server";

// กติกาทั้งหมด (ลำดับขั้น เจ้าของ เวลา การตรวจคะแนน) ตรวจในฟังก์ชันฐานข้อมูล quiz_... ไฟล์นี้เพียงส่งต่อคำขอ

/** รหัสอุปกรณ์ของผู้เรียน ปกติ proxy ออกให้แล้ว ถ้ายังไม่มีให้ออกที่นี่ */
async function ensureDevice(): Promise<string> {
  const existing = await quizDevice();
  if (existing) return existing;
  const id = randomUUID();
  (await cookies()).set(QUIZ_DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

/** เริ่มหรือกลับมาทำแบบทดสอบต่อ (formData: kind, unit_id หรือ course_id, restart) แล้วพาไปหน้าทำข้อสอบ */
export async function startQuiz(_prev: FormState, formData: FormData): Promise<FormState> {
  const kind = String(formData.get("kind") ?? "");
  const unitId = String(formData.get("unit_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  if (!(ATTEMPT_KINDS as readonly string[]).includes(kind)) return { error: "ชนิดแบบทดสอบไม่ถูกต้อง" };
  if (kind === "full" ? !isUuid(courseId) : !isUuid(unitId)) return { error: "ไม่พบรายวิชาหรือหน่วยการเรียนนี้" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quiz_start", {
    p_kind: kind,
    p_course: kind === "full" ? courseId : null,
    p_unit: kind === "full" ? null : unitId,
    p_device: await ensureDevice(),
    p_restart: formData.get("restart") === "1",
  });
  if (error) return { error: explainError(error) };
  redirect(`${QUIZ_BASE}/attempt/${data as string}`);
}

/** บันทึกคำตอบของข้อเดียว (บันทึกอัตโนมัติเมื่อเลือกตัวเลือก) */
export async function saveAnswer(attemptId: string, questionId: string, choice: string): Promise<ActionResult> {
  if (!isUuid(attemptId) || !isUuid(questionId) || !isChoiceKey(choice)) return { ok: false, error: "คำตอบไม่ถูกต้อง" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_save_answer", {
    p_attempt: attemptId,
    p_question: questionId,
    p_choice: choice,
    p_device: await quizDevice(),
  });
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true };
}

/** ส่งคำตอบทั้งชุด (ตรวจคะแนนในฐานข้อมูล) */
export async function submitAttempt(attemptId: string): Promise<ActionResult> {
  if (!isUuid(attemptId)) return { ok: false, error: "ไม่พบแบบทดสอบนี้" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_submit", { p_attempt: attemptId, p_device: await quizDevice() });
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true };
}
