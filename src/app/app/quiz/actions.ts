"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/form";
import type { ImportPreviewResult } from "@/components/import-dialog";
import { explainError, type ActionResult } from "@/lib/errors";
import { readUploadedSheet } from "@/lib/excel";
import { isUuid } from "@/lib/persons-server";
import {
  DIFFICULTIES,
  LESSON_IMAGE_MAX_BYTES,
  LESSON_IMAGE_TYPES,
  LESSON_MAX_BLOCKS,
  LESSON_MEDIA_BUCKET,
  LESSON_PDF_MAX_BYTES,
  LESSON_TEXT_MAX,
  QUESTION_IMPORT_HEADERS,
  QUESTION_IMPORT_MAX_ROWS,
  QUESTION_STATUSES,
  YEAR_MAX,
  YEAR_MIN,
  isChoiceKey,
  validateQuestionImportRows,
  youtubeId,
  type LessonBlock,
  type QuestionImportRaw,
  type QuestionImportRow,
  type QuestionStatus,
} from "@/lib/quiz";
import { questionFilterArgs } from "@/lib/quiz-server";
import { createClient } from "@/lib/supabase/server";

// สิทธิ์ทุกรายการตรวจที่ฐานข้อมูล (RLS และฟังก์ชัน can_manage_quiz) ผู้ที่ไม่ใช่ผู้จัดการคลังข้อสอบจะแก้ไม่ได้แม้เรียกตรง

const ROOT = "/app/quiz";
const LIST = "/app/quiz/questions";
const COURSES = "/app/quiz/courses";
const DENIED = "ท่านไม่มีสิทธิ์จัดการคลังข้อสอบ";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function explainQuizError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "มีข้อสอบข้อนี้ (โจทย์และตัวเลือกเดียวกัน) ในรายวิชานี้อยู่แล้ว";
  if (error.code === "42501") return DENIED;
  return explainError(error);
}

// ------------------------------------------------------------------
// ข้อสอบ
// ------------------------------------------------------------------

/** เพิ่มหรือแก้ไขข้อสอบ (ช่อง id ว่าง = เพิ่มใหม่ เข้าเป็น ร่าง เสมอ) การเผยแพร่ทำที่หน้าดูตัวอย่าง */
export async function saveQuestion(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const correct = text(formData, "correct_choice");
  const difficulty = text(formData, "difficulty") || "medium";
  const yearText = text(formData, "source_year_be");

  if (!isUuid(text(formData, "course_id"))) return { error: "กรุณาเลือกรายวิชา" };
  if (!isUuid(text(formData, "unit_id"))) return { error: "กรุณาเลือกหน่วยการเรียน" };
  if (!text(formData, "question_text")) return { error: "กรุณากรอกโจทย์" };
  for (const [key, label] of [["choice_a", "ก"], ["choice_b", "ข"], ["choice_c", "ค"], ["choice_d", "ง"]]) {
    if (!text(formData, key)) return { error: `กรุณากรอกตัวเลือก ${label}` };
  }
  if (!isChoiceKey(correct)) return { error: "กรุณาเลือกข้อถูก" };
  if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) return { error: "ระดับความยากไม่ถูกต้อง" };
  let year: number | null = null;
  if (yearText) {
    year = Number(yearText);
    if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) {
      return { error: "ปีของข้อสอบต้องเป็นปี พ.ศ. เช่น 2567 (เว้นว่างได้)" };
    }
  }

  const row = {
    course_id: text(formData, "course_id"),
    unit_id: text(formData, "unit_id"),
    question_text: text(formData, "question_text"),
    choice_a: text(formData, "choice_a"),
    choice_b: text(formData, "choice_b"),
    choice_c: text(formData, "choice_c"),
    choice_d: text(formData, "choice_d"),
    correct_choice: correct,
    explanation: text(formData, "explanation"),
    source_year_be: year,
    difficulty,
    lesson_id: isUuid(text(formData, "lesson_id")) ? text(formData, "lesson_id") : null,
  };

  const supabase = await createClient();
  let savedId = id;
  if (id) {
    if (!isUuid(id)) return { error: "ไม่พบข้อสอบนี้" };
    const { data, error } = await supabase.from("questions").update(row).eq("id", id).select("id");
    if (error) return { error: explainQuizError(error) };
    if (!data?.length) return { error: DENIED };
  } else {
    const { data, error } = await supabase.from("questions").insert(row).select("id").single();
    if (error) return { error: explainQuizError(error) };
    savedId = (data as { id: string }).id;
  }

  revalidatePath(ROOT, "layout");
  redirect(`${LIST}/${savedId}?saved=1`);
}

/** เผยแพร่ หรือถอนกลับเป็นร่าง */
export async function setQuestionStatus(id: string, status: QuestionStatus): Promise<ActionResult> {
  if (!isUuid(id) || !(QUESTION_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "ไม่พบข้อสอบนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("questions").update({ status }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainQuizError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath(ROOT, "layout");
  return { ok: true, message: status === "published" ? "เผยแพร่แล้ว" : "ถอนกลับเป็นร่างแล้ว" };
}

/** ปิดหรือเปิดใช้งานข้อสอบ (ไม่ลบข้อมูลจริง) */
export async function setQuestionActive(id: string, active: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "ไม่พบข้อสอบนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("questions").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainQuizError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath(ROOT, "layout");
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว" };
}

export type DraftFilters = { q: string; filters: Record<string, string> };

/** นับ (dryRun) หรือเผยแพร่ข้อสอบฉบับร่างทั้งหมดที่ตรงกับตัวกรองของหน้ารายการ */
export async function publishDrafts(
  filter: DraftFilters,
  dryRun: boolean,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const args = questionFilterArgs({
    q: String(filter?.q ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 100),
    filters: Object.fromEntries(Object.entries(filter?.filters ?? {}).map(([k, v]) => [k, String(v)])),
  });
  if (args.p_status && args.p_status !== "draft") return { ok: true, count: 0 };
  const supabase = await createClient();
  if (dryRun) {
    const { data, error } = await supabase.rpc("list_questions", { ...args, p_status: "draft", p_limit: 1, p_offset: 0 });
    if (error) return { ok: false, error: explainQuizError(error) };
    return { ok: true, count: Number((data as { total_count: number }[] | null)?.[0]?.total_count ?? 0) };
  }
  const { data, error } = await supabase.rpc("publish_draft_questions", {
    p_q: args.p_q,
    p_course: args.p_course,
    p_unit: args.p_unit,
    p_year: args.p_year,
    p_difficulty: args.p_difficulty,
  });
  if (error) return { ok: false, error: explainQuizError(error) };
  revalidatePath(ROOT, "layout");
  return { ok: true, count: Number(data ?? 0) };
}

// ------------------------------------------------------------------
// นำเข้าจาก Excel
// ------------------------------------------------------------------

async function checkRows(raw: QuestionImportRaw[]): Promise<QuestionImportRow[]> {
  const rows = validateQuestionImportRows(raw);
  const candidates = rows.filter((r) => r.status === "new" && r.data);
  if (candidates.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_questions_import", { p_rows: candidates.map((r) => r.data) });
    if (error) throw error;
    const results = new Map(
      ((data as { row_number: number; status: QuestionImportRow["status"]; message: string }[] | null) ?? []).map((d) => [
        d.row_number,
        d,
      ]),
    );
    for (const row of candidates) {
      const result = results.get(row.rowNumber);
      if (result) {
        row.status = result.status;
        row.message = result.message;
      }
    }
  }
  return rows;
}

export async function previewQuestionImport(formData: FormData): Promise<ImportPreviewResult<QuestionImportRaw[]>> {
  try {
    const sheet = await readUploadedSheet(formData, QUESTION_IMPORT_HEADERS, QUESTION_IMPORT_MAX_ROWS);
    if (!sheet.ok) return sheet;
    const rows = await checkRows(sheet.rows);
    return {
      ok: true,
      rows: rows.map(({ rowNumber, cells, status, message }) => ({ rowNumber, cells, status, message })),
      payload: sheet.rows,
    };
  } catch (error) {
    return { ok: false, error: explainQuizError(error as { code?: string; message?: string }) };
  }
}

export async function confirmQuestionImport(raw: QuestionImportRaw[]): Promise<ActionResult> {
  try {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > QUESTION_IMPORT_MAX_ROWS) {
      return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
    }
    // ตรวจซ้ำฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อผลตรวจที่ส่งมาจากหน้าจอ
    const rows = await checkRows(
      raw.map((r) => ({
        rowNumber: Number(r.rowNumber),
        cells: Array.isArray(r.cells) ? r.cells.map((c) => String(c ?? "")) : [],
      })),
    );
    const errors = rows.filter((r) => r.status === "error").length;
    // ส่งแถวที่ผ่านทั้งหมด (รวมแถวที่ซ้ำกันในไฟล์) ให้ฐานข้อมูลตัดสินข้อซ้ำเองอีกครั้ง
    const usable = rows.filter((r) => r.status !== "error" && r.data);
    if (errors > 0) return { ok: false, error: `ยังมีแถวที่ผิด ${errors} แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่` };
    if (!rows.some((r) => r.status === "new")) return { ok: false, error: "ไม่มีข้อใหม่ให้นำเข้า (ทุกแถวมีในคลังแล้ว)" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_questions", { p_rows: usable.map((r) => r.data) });
    if (error) return { ok: false, error: explainQuizError(error) };
    revalidatePath(ROOT, "layout");
    return {
      ok: true,
      message: `นำเข้าแล้ว ${Number(data).toLocaleString("th-TH")} ข้อ เป็นฉบับร่าง กรุณาตรวจแล้วกดเผยแพร่`,
    };
  } catch (error) {
    return { ok: false, error: explainQuizError(error as { code?: string; message?: string }) };
  }
}

// ------------------------------------------------------------------
// รายวิชาและหน่วยการเรียน
// ------------------------------------------------------------------

export async function renameCourse(courseId: string, name: string): Promise<ActionResult> {
  const clean = String(name ?? "").trim();
  if (!isUuid(courseId)) return { ok: false, error: "ไม่พบรายวิชานี้" };
  if (!clean) return { ok: false, error: "กรุณากรอกชื่อรายวิชา" };
  if (clean.length > 200) return { ok: false, error: "ชื่อรายวิชายาวเกิน 200 ตัวอักษร" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("courses").update({ name: clean }).eq("id", courseId).select("id");
  if (error) return { ok: false, error: error.code === "23505" ? "มีรายวิชาอื่นใช้ชื่อนี้แล้ว" : explainQuizError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath(ROOT, "layout");
  return { ok: true, message: "บันทึกชื่อรายวิชาแล้ว" };
}

/** เพิ่มหน่วยการเรียน (ต่อท้ายลำดับ) หรือเปลี่ยนชื่อ (ส่ง unitId) */
export async function saveUnit(courseId: string, unitId: string | null, name: string): Promise<ActionResult> {
  const clean = String(name ?? "").trim();
  if (!isUuid(courseId)) return { ok: false, error: "ไม่พบรายวิชานี้" };
  if (!clean) return { ok: false, error: "กรุณากรอกชื่อหน่วย" };
  if (clean.length > 200) return { ok: false, error: "ชื่อหน่วยยาวเกิน 200 ตัวอักษร" };
  const supabase = await createClient();
  if (unitId) {
    if (!isUuid(unitId)) return { ok: false, error: "ไม่พบหน่วยนี้" };
    const { data, error } = await supabase.from("units").update({ name: clean }).eq("id", unitId).eq("course_id", courseId).select("id");
    if (error) return { ok: false, error: explainUnitError(error) };
    if (!data?.length) return { ok: false, error: DENIED };
  } else {
    const { error } = await supabase.from("units").insert({ course_id: courseId, name: clean });
    if (error) return { ok: false, error: explainUnitError(error) };
  }
  revalidatePath(ROOT, "layout");
  return { ok: true, message: unitId ? "เปลี่ยนชื่อหน่วยแล้ว" : "เพิ่มหน่วยแล้ว" };
}

function explainUnitError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "รายวิชานี้มีหน่วยชื่อนี้อยู่แล้ว";
  return explainQuizError(error);
}

export async function setUnitActive(unitId: string, active: boolean): Promise<ActionResult> {
  if (!isUuid(unitId)) return { ok: false, error: "ไม่พบหน่วยนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("units").update({ is_active: active }).eq("id", unitId).select("id");
  if (error) return { ok: false, error: explainUnitError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath(ROOT, "layout");
  return { ok: true, message: active ? "เปิดใช้งานหน่วยแล้ว" : "ปิดใช้งานหน่วยแล้ว" };
}

/** เลื่อนลำดับหน่วยขึ้นหรือลง 1 ขั้น (จัดเลขลำดับของหน่วยที่ใช้งานใหม่เป็น 1, 2, 3 ...) */
export async function moveUnit(unitId: string, direction: "up" | "down"): Promise<ActionResult> {
  if (!isUuid(unitId)) return { ok: false, error: "ไม่พบหน่วยนี้" };
  const supabase = await createClient();
  const { data: unit } = await supabase.from("units").select("id, course_id").eq("id", unitId).maybeSingle();
  if (!unit) return { ok: false, error: DENIED };
  const { data } = await supabase
    .from("units")
    .select("id, sort_order")
    .eq("course_id", (unit as { course_id: string }).course_id)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  const list = (data as { id: string; sort_order: number }[] | null) ?? [];
  const index = list.findIndex((u) => u.id === unitId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return { ok: true };
  [list[index], list[target]] = [list[target], list[index]];
  for (const [i, u] of list.entries()) {
    if (u.sort_order === i + 1) continue;
    const { error } = await supabase.from("units").update({ sort_order: i + 1 }).eq("id", u.id);
    if (error) return { ok: false, error: explainUnitError(error) };
  }
  revalidatePath(COURSES, "layout");
  return { ok: true };
}

// ------------------------------------------------------------------
// บทเรียน (บทที่ 13)
// ------------------------------------------------------------------

const LESSONS = "/app/quiz/lessons";

function explainLessonError(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return DENIED;
  return explainError(error);
}

/** เพิ่มบทเรียนใหม่ (ฉบับร่าง ยังไม่มีเนื้อหา) แล้วพาไปหน้าแก้ไข */
export async function createLesson(_prev: FormState, formData: FormData): Promise<FormState> {
  const unitId = text(formData, "unit_id");
  const title = text(formData, "title");
  if (!isUuid(unitId)) return { error: "กรุณาเลือกหน่วยการเรียน" };
  if (!title) return { error: "กรุณากรอกหัวข้อบทเรียน" };
  if (title.length > 200) return { error: "หัวข้อยาวเกิน 200 ตัวอักษร" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("lessons").insert({ unit_id: unitId, title }).select("id").single();
  if (error) return { error: explainLessonError(error) };
  revalidatePath(ROOT, "layout");
  redirect(`${LESSONS}/${(data as { id: string }).id}?created=1`);
}

/** ตรวจและจัดรูปชิ้นเนื้อหาที่ส่งมาจากหน้าจอ (ไม่เชื่อค่าที่ส่งมา) คืนข้อความผิดพลาดถ้าใช้ไม่ได้ */
function cleanBlocks(lessonId: string, raw: unknown): { blocks: LessonBlock[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "รูปแบบเนื้อหาไม่ถูกต้อง" };
  if (raw.length > LESSON_MAX_BLOCKS) return { error: `บทเรียนหนึ่งหัวข้อมีเนื้อหาได้ไม่เกิน ${LESSON_MAX_BLOCKS} ชิ้น` };
  const blocks: LessonBlock[] = [];
  for (const [i, item] of raw.entries()) {
    const b = (item ?? {}) as Record<string, unknown>;
    const n = i + 1;
    const str = (key: string) => String(b[key] ?? "").trim();
    if (b.type === "text") {
      const value = String(b.text ?? "").replace(/\r\n/g, "\n").trim();
      if (!value) return { error: `ชิ้นที่ ${n} (ข้อความ) ยังว่างอยู่ กรุณากรอกหรือลบชิ้นนี้` };
      if (value.length > LESSON_TEXT_MAX) return { error: `ชิ้นที่ ${n} (ข้อความ) ยาวเกิน ${LESSON_TEXT_MAX.toLocaleString("th-TH")} ตัวอักษร` };
      blocks.push({ type: "text", text: value });
    } else if (b.type === "image") {
      if (!new RegExp(`^${lessonId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(str("path"))) {
        return { error: `ชิ้นที่ ${n} (รูป) ยังไม่ได้อัปโหลดรูป กรุณาเลือกรูปหรือลบชิ้นนี้` };
      }
      blocks.push({ type: "image", path: str("path"), caption: str("caption").slice(0, 300) });
    } else if (b.type === "pdf") {
      if (!new RegExp(`^${lessonId}/[0-9a-f-]{36}\\.pdf$`).test(str("path"))) {
        return { error: `ชิ้นที่ ${n} (ไฟล์ PDF) ยังไม่ได้อัปโหลดไฟล์ กรุณาเลือกไฟล์หรือลบชิ้นนี้` };
      }
      blocks.push({ type: "pdf", path: str("path"), title: str("title").slice(0, 200) });
    } else if (b.type === "video") {
      const id = youtubeId(str("video_id"));
      if (!id) return { error: `ชิ้นที่ ${n} (วิดีโอ) ลิงก์ YouTube ไม่ถูกต้อง ตัวอย่างที่ใช้ได้: https://www.youtube.com/watch?v=...` };
      blocks.push({ type: "video", video_id: id });
    } else {
      return { error: `ชิ้นที่ ${n} ชนิดเนื้อหาไม่ถูกต้อง` };
    }
  }
  return { blocks };
}

/** บันทึกหัวข้อและเนื้อหาของบทเรียน */
export async function saveLesson(lessonId: string, title: string, rawBlocks: unknown): Promise<ActionResult> {
  if (!isUuid(lessonId)) return { ok: false, error: "ไม่พบบทเรียนนี้" };
  const cleanTitle = String(title ?? "").trim();
  if (!cleanTitle) return { ok: false, error: "กรุณากรอกหัวข้อบทเรียน" };
  if (cleanTitle.length > 200) return { ok: false, error: "หัวข้อยาวเกิน 200 ตัวอักษร" };
  const cleaned = cleanBlocks(lessonId, rawBlocks);
  if ("error" in cleaned) return { ok: false, error: cleaned.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .update({ title: cleanTitle, blocks: cleaned.blocks })
    .eq("id", lessonId)
    .select("id");
  if (error) return { ok: false, error: explainLessonError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath(ROOT, "layout");
  return { ok: true, message: "บันทึกบทเรียนแล้ว" };
}

export async function setLessonStatus(lessonId: string, status: QuestionStatus): Promise<ActionResult> {
  if (!isUuid(lessonId) || !(QUESTION_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "ไม่พบบทเรียนนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("lessons").update({ status }).eq("id", lessonId).select("id");
  if (error) return { ok: false, error: explainLessonError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath(ROOT, "layout");
  return { ok: true, message: status === "published" ? "เผยแพร่บทเรียนแล้ว ผู้เรียนเห็นได้ทันที" : "ถอนกลับเป็นร่างแล้ว ผู้เรียนไม่เห็นบทเรียนนี้" };
}

export async function setLessonActive(lessonId: string, active: boolean): Promise<ActionResult> {
  if (!isUuid(lessonId)) return { ok: false, error: "ไม่พบบทเรียนนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("lessons").update({ is_active: active }).eq("id", lessonId).select("id");
  if (error) return { ok: false, error: explainLessonError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath(ROOT, "layout");
  return { ok: true, message: active ? "เปิดใช้งานบทเรียนแล้ว" : "ปิดใช้งานบทเรียนแล้ว" };
}

/** เลื่อนลำดับบทเรียนในหน่วยขึ้นหรือลง 1 ขั้น */
export async function moveLesson(lessonId: string, direction: "up" | "down"): Promise<ActionResult> {
  if (!isUuid(lessonId)) return { ok: false, error: "ไม่พบบทเรียนนี้" };
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("id, unit_id").eq("id", lessonId).maybeSingle();
  if (!lesson) return { ok: false, error: DENIED };
  const { data } = await supabase
    .from("lessons")
    .select("id, sort_order")
    .eq("unit_id", (lesson as { unit_id: string }).unit_id)
    .eq("is_active", true)
    .order("sort_order")
    .order("title");
  const list = (data as { id: string; sort_order: number }[] | null) ?? [];
  const index = list.findIndex((l) => l.id === lessonId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return { ok: true };
  [list[index], list[target]] = [list[target], list[index]];
  for (const [i, l] of list.entries()) {
    if (l.sort_order === i + 1) continue;
    const { error } = await supabase.from("lessons").update({ sort_order: i + 1 }).eq("id", l.id);
    if (error) return { ok: false, error: explainLessonError(error) };
  }
  revalidatePath(LESSONS, "layout");
  return { ok: true };
}

/**
 * อัปโหลดรูปหรือ PDF ของบทเรียนเข้าที่เก็บสาธารณะ lesson-media (formData: file, kind = image | pdf)
 * คืน path ที่ใช้ใส่ในชิ้นเนื้อหา ไฟล์ยังไม่แสดงต่อผู้เรียนจนกว่าจะกดบันทึกบทเรียนและเผยแพร่
 */
export async function uploadLessonMedia(
  lessonId: string,
  formData: FormData,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    if (!isUuid(lessonId)) return { ok: false, error: "ไม่พบบทเรียนนี้" };
    const file = formData.get("file");
    const kind = String(formData.get("kind") ?? "");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์" };
    let ext: string;
    if (kind === "image") {
      ext = LESSON_IMAGE_TYPES[file.type];
      if (!ext) return { ok: false, error: "รับเฉพาะรูป JPG, PNG หรือ WebP" };
      if (file.size > LESSON_IMAGE_MAX_BYTES) return { ok: false, error: "รูปใหญ่เกิน 5 MB" };
    } else if (kind === "pdf") {
      if (file.type !== "application/pdf") return { ok: false, error: "รับเฉพาะไฟล์ PDF" };
      if (file.size > LESSON_PDF_MAX_BYTES) return { ok: false, error: "ไฟล์ PDF ใหญ่เกิน 10 MB" };
      ext = "pdf";
    } else {
      return { ok: false, error: "ชนิดไฟล์ไม่ถูกต้อง" };
    }
    const supabase = await createClient();
    // ต้องเป็นบทเรียนที่ผู้ใช้มองเห็น (RLS ให้เห็นเฉพาะผู้จัดการคลังข้อสอบ)
    const { data: lesson } = await supabase.from("lessons").select("id").eq("id", lessonId).maybeSingle();
    if (!lesson) return { ok: false, error: DENIED };
    const path = `${lessonId}/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(LESSON_MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { ok: false, error: explainError(error) };
    return { ok: true, path };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}
