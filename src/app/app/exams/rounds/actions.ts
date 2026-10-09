"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/form";
import { explainError, type ActionResult } from "@/lib/errors";
import { isExamLevel, isExamType, type RoundStatus } from "@/lib/exam-forms";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh() {
  revalidatePath("/app/exams", "layout");
}

const duplicate = "มีรอบของปีการศึกษา ประเภท และชั้นนี้อยู่แล้ว (รอบที่ยังไม่ยกเลิกมีได้รอบเดียว)";

/** สร้างหรือแก้ไขรอบ (RLS ยอมให้เฉพาะส่วนกลางและผู้ดูแลระบบ กติกาวันที่และสถานะอยู่ใน trigger exam_rounds_check) */
export async function saveExamRound(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const yearId = String(formData.get("academic_year_id") ?? "");
  const examType = String(formData.get("exam_type") ?? "");
  const level = String(formData.get("level") ?? "");
  const dates = Object.fromEntries(
    ["opens_on", "closes_on", "exam_starts_on", "exam_ends_on"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const note = String(formData.get("note") ?? "").trim();

  for (const k of ["opens_on", "closes_on", "exam_starts_on", "exam_ends_on"]) {
    if (formData.get(`${k}_incomplete`)) return { error: "กรอกวันที่ให้ครบทั้งวัน เดือน และปี หรือเว้นว่างทั้งช่อง" };
  }
  if (!id && !UUID.test(yearId)) return { error: "กรุณาเลือกปีการศึกษา" };
  if (!id && (!isExamType(examType) || !isExamLevel(level))) return { error: "กรุณาเลือกประเภทและชั้น" };
  if (!DATE.test(dates.opens_on) || !DATE.test(dates.closes_on)) return { error: "กรุณากรอกวันเปิดและวันปิดรับสมัคร" };
  if (!DATE.test(dates.exam_starts_on)) return { error: "กรุณากรอกวันสอบ" };
  if (dates.closes_on < dates.opens_on) return { error: "วันปิดรับสมัครต้องไม่ก่อนวันเปิดรับสมัคร" };
  if (dates.exam_starts_on < dates.closes_on) return { error: "วันสอบต้องไม่ก่อนวันปิดรับสมัคร" };
  if (dates.exam_ends_on && dates.exam_ends_on < dates.exam_starts_on) return { error: "วันสอบวันสุดท้ายต้องไม่ก่อนวันสอบวันแรก" };
  if (note.length > 500) return { error: "หมายเหตุยาวเกิน 500 ตัวอักษร" };

  const row: Record<string, string | null> = {
    opens_on: dates.opens_on,
    closes_on: dates.closes_on,
    exam_starts_on: dates.exam_starts_on,
    exam_ends_on: dates.exam_ends_on || null,
    note,
  };
  const supabase = await createClient();
  if (id) {
    if (!UUID.test(id)) return { error: "ไม่พบรอบนี้" };
    // ปี ประเภท ชั้น แก้ได้เฉพาะรอบที่ยังเป็นร่าง (ฐานข้อมูลตรวจซ้ำ)
    if (UUID.test(yearId)) row.academic_year_id = yearId;
    if (isExamType(examType)) row.exam_type = examType;
    if (isExamLevel(level)) row.level = level;
    const { data, error } = await supabase.from("exam_rounds").update(row).eq("id", id).select("id");
    if (error) return { error: error.code === "23505" ? duplicate : explainError(error) };
    if (!data?.length) return { error: "ท่านไม่มีสิทธิ์แก้ไขรอบนี้" };
    refresh();
    return { message: "บันทึกการแก้ไขรอบแล้ว" };
  }
  const { data, error } = await supabase
    .from("exam_rounds")
    .insert({ ...row, academic_year_id: yearId, exam_type: examType, level })
    .select("id");
  if (error) return { error: error.code === "23505" ? duplicate : explainError(error) };
  if (!data?.length) return { error: "ท่านไม่มีสิทธิ์สร้างรอบสมัครสอบ" };
  refresh();
  return { message: "สร้างรอบแล้ว (สถานะ ร่าง) กด เปิดรับสมัคร เมื่อพร้อม" };
}

const STATUS_MESSAGE: Record<RoundStatus, string> = {
  draft: "",
  open: "เปิดรับสมัครแล้ว",
  closed: "ปิดรับสมัครแล้ว",
};

export async function setExamRoundStatus(id: string, status: RoundStatus): Promise<ActionResult> {
  if (!UUID.test(id) || (status !== "open" && status !== "closed")) return { ok: false, error: "ไม่พบรอบนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("exam_rounds").update({ status }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  refresh();
  return { ok: true, message: STATUS_MESSAGE[status] };
}

/** ยกเลิกรอบที่ยังเป็นร่าง (ปิดใช้งาน ไม่ลบ) */
export async function cancelExamRound(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "ไม่พบรอบนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("exam_rounds").update({ is_active: false }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  refresh();
  return { ok: true, message: "ยกเลิกรอบแล้ว" };
}
