"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";

import { explainError, type ActionResult } from "@/lib/errors";
import { fetchFormTemplate, fetchTemplateContext } from "@/lib/exam-forms-server";
import { REGISTRATION_STATS_TAG, type CandidateError } from "@/lib/exam-batches";
import { fetchBatch, uploadLimits } from "@/lib/exam-batches-server";
import { cleanText, parseRegistrationFile } from "@/lib/exam-upload";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const BUCKET = "registration-files";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type UploadResult = { ok: true; id: string; appended?: number } | { ok: false; error: string; details?: string[] };

const refresh = (batchId?: string) => {
  if (batchId) revalidatePath(`/app/exams/batches/${batchId}`);
  revalidatePath("/app/exams/batches");
  revalidateTag(REGISTRATION_STATS_TAG, { expire: 0 });
};

/**
 * ขั้น ก.-ข.: รับไฟล์ ตรวจโครงแฟ้ม อ่านทุกแถว เก็บไฟล์ต้นฉบับ แล้วให้ฐานข้อมูลตรวจรายแถว
 * ถ้ามีบัญชีของ รอบ + สำนัก + สนามสอบ นี้อยู่แล้ว = ต่อท้ายบัญชีเดิม (ไฟล์เพิ่มเติม) มิฉะนั้นสร้างบัญชีใหม่ (ร่าง)
 * formData: round, place, venue, file หรือ batch, file (อัปโหลดเพิ่มจากหน้าบัญชี)
 */
export async function uploadRegistration(formData: FormData): Promise<UploadResult> {
  try {
    let roundId = String(formData.get("round") ?? "");
    let placeId = String(formData.get("place") ?? "");
    let venueId = String(formData.get("venue") ?? "");
    let existingId: string | null = null;
    const batchParam = String(formData.get("batch") ?? "");
    if (UUID.test(batchParam)) {
      const batch = await fetchBatch(batchParam);
      if (!batch) return { ok: false, error: "ไม่พบบัญชีนี้" };
      roundId = batch.round.id;
      placeId = batch.place.id;
      venueId = batch.venue.id;
      existingId = batch.id;
    }
    const file = formData.get("file");
    if (![roundId, placeId, venueId].every((v) => UUID.test(v))) return { ok: false, error: "กรุณาเลือกรอบ สำนัก และสนามสอบให้ครบ" };
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์ Excel" };
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xls")) {
      return { ok: false, error: "ไฟล์ .xls (Excel แบบเก่า) ใช้ไม่ได้ กรุณาเปิดใน Excel แล้วบันทึกเป็น .xlsx ก่อน" };
    }
    if (!lower.endsWith(".xlsx")) return { ok: false, error: "รับเฉพาะไฟล์ Excel นามสกุล .xlsx" };

    const limits = await uploadLimits();
    if (file.size > limits.maxMb * 1024 * 1024) return { ok: false, error: `ไฟล์ใหญ่เกิน ${limits.maxMb} MB` };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

    // รอบเปิดรับ สำนักอยู่ในเขต สนามสอบเปิดสอบชั้นนี้ (ตรวจที่ฐานข้อมูล)
    const ctx = await fetchTemplateContext(roundId, placeId, venueId);
    if (!ctx.ok) return ctx;
    const template = await fetchFormTemplate(ctx.context.template_id);
    if (!template) return { ok: false, error: "ไม่พบแบบฟอร์มบัญชี ศ. ของรอบนี้" };

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parseRegistrationFile(buf, template, {
      yearBe: ctx.context.year_be,
      venueCode: ctx.context.venue.code,
      maxRows: limits.maxRows,
    });
    if (!parsed.ok) {
      return { ok: false, error: "ไฟล์นี้ยังรับไม่ได้ กรุณาแก้ตามรายการแล้วอัปโหลดใหม่", details: parsed.errors };
    }

    // เก็บไฟล์ต้นฉบับในโฟลเดอร์ของผู้อัปโหลด (ชื่อไฟล์จริงเก็บในตาราง)
    const path = `${user.id}/${randomUUID()}.xlsx`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: XLSX_TYPE, upsert: false });
    if (uploadError) return { ok: false, error: `เก็บไฟล์ต้นฉบับไม่สำเร็จ: ${explainError(uploadError)}` };

    if (!existingId) {
      const { data: found } = await supabase
        .from("registration_batches")
        .select("id")
        .eq("round_id", roundId)
        .eq("place_id", placeId)
        .eq("venue_id", venueId)
        .neq("status", "withdrawn")
        .maybeSingle();
      existingId = found?.id ?? null;
    }
    const fileInfo = { name: file.name.slice(0, 200), path, size: file.size };
    const { data, error } = existingId
      ? await supabase.rpc("append_registration_file", { p_batch: existingId, p_file: fileInfo, p_rows: parsed.rows })
      : await supabase.rpc("create_registration_batch", {
          p_round: roundId,
          p_place: placeId,
          p_venue: venueId,
          p_file: fileInfo,
          p_rows: parsed.rows,
        });
    if (error || data === null || data === undefined) {
      await supabase.storage.from(BUCKET).remove([path]);
      return { ok: false, error: explainError(error) };
    }
    const id = existingId ?? String(data);
    refresh(id);
    return { ok: true, id, appended: existingId ? Number(data) : undefined };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

/** ขั้น ง.: ยืนยันชุด (onlyOk = บันทึกเฉพาะแถวที่ผ่าน) */
export async function confirmBatch(batchId: string, onlyOk: boolean): Promise<ActionResult> {
  if (!UUID.test(batchId)) return { ok: false, error: "ไม่พบบัญชี" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_registration_batch", { p_batch: batchId, p_only_ok: onlyOk });
  refresh(batchId);
  if (error) return { ok: false, error: explainError(error) };
  const result = data as { saved: number; blocked: boolean; ok_count: number; error_count: number };
  if (result.blocked) {
    return {
      ok: false,
      error:
        result.ok_count === 0
          ? "ไม่มีแถวที่ผ่านการตรวจ จึงบันทึกไม่ได้ กรุณาแก้ไฟล์แล้วอัปโหลดใหม่"
          : `มีแถวที่ไม่ผ่านการตรวจ ${result.error_count.toLocaleString("th-TH")} แถว (อาจมีผู้สมัครซ้ำที่เพิ่งยืนยันจากชุดอื่น) แก้ไฟล์แล้วอัปโหลดใหม่ หรือเลือก บันทึกเฉพาะแถวที่ผ่าน`,
    };
  }
  return { ok: true, message: `บันทึกผู้สมัคร ${result.saved.toLocaleString("th-TH")} คน และออกรหัสผู้สมัครแล้ว` };
}

/** ถอนชุด (ก่อนส่ง) ผู้สมัครในชุดไม่นับอีกต่อไป */
export async function withdrawBatch(batchId: string, reason: string): Promise<ActionResult> {
  if (!UUID.test(batchId)) return { ok: false, error: "ไม่พบบัญชี" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_registration_batch", { p_batch: batchId, p_reason: reason.trim().slice(0, 500) });
  refresh(batchId);
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true, message: "ถอนบัญชีแล้ว" };
}

/** ส่งบัญชี (หรือส่งอีกครั้งเมื่อถูกส่งกลับ): ล็อกรายชื่อ ออกเลขที่รับ ส่งให้เจ้าคณะอำเภอ จังหวัด รับรอง */
export async function submitBatch(batchId: string): Promise<ActionResult> {
  if (!UUID.test(batchId)) return { ok: false, error: "ไม่พบบัญชี" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_registration_batch", { p_batch: batchId });
  refresh(batchId);
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true, message: `ส่งบัญชีแล้ว เลขที่รับ ${String(data)} รอเจ้าคณะอำเภอและจังหวัดรับรอง` };
}

/** ดึงบัญชีกลับ (ยกเลิกการส่งที่ยังรอรับรอง) ผู้ส่งเท่านั้น */
export async function cancelSubmission(batchId: string, requestId: string): Promise<ActionResult> {
  if (!UUID.test(batchId) || !UUID.test(requestId)) return { ok: false, error: "ไม่พบบัญชี" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  refresh(batchId);
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true, message: "ดึงบัญชีกลับแล้ว แก้ไขแล้วส่งใหม่ได้ (จะได้เลขที่รับใหม่)" };
}

/** ถอนรายชื่อ 1 คน */
export async function withdrawCandidate(batchId: string, candidateId: string, reason: string): Promise<ActionResult> {
  if (!UUID.test(batchId) || !UUID.test(candidateId)) return { ok: false, error: "ไม่พบรายชื่อ" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_candidate", { p_candidate: candidateId, p_reason: reason.trim().slice(0, 500) });
  refresh(batchId);
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true, message: "ถอนรายชื่อแล้ว" };
}

export type SaveCandidateResult =
  | { ok: true; message: string; id: string }
  | { ok: false; error: string; errors?: CandidateError[] };

/**
 * แก้ไขรายคน (candidate = รหัสผู้สมัครในตาราง) หรือเพิ่มทีละคน (ไม่ส่ง candidate)
 * formData: ช่อง f_<คีย์คอลัมน์> ตามแบบ ศ. (วันที่จาก ThaiDateInput เป็น YYYY-MM-DD) และ reason
 */
export async function saveCandidate(batchId: string, candidateId: string | null, formData: FormData): Promise<SaveCandidateResult> {
  if (!UUID.test(batchId) || (candidateId !== null && !UUID.test(candidateId))) return { ok: false, error: "ไม่พบบัญชี" };
  const batch = await fetchBatch(batchId);
  if (!batch) return { ok: false, error: "ไม่พบบัญชี หรือท่านไม่มีสิทธิ์" };
  const values: Record<string, string> = {};
  const errors: CandidateError[] = [];
  for (const col of batch.template.columns) {
    const raw = String(formData.get(`f_${col.key}`) ?? "");
    if (col.type === "date" && formData.get(`f_${col.key}_incomplete`)) {
      errors.push({ field: col.key, label: col.label, message: "กรอกวันที่ไม่ครบหรือไม่มีวันนี้จริง" });
      continue;
    }
    let text = cleanText(raw);
    if (col.type === "id") text = text.replace(/[\s-]/g, "");
    if (text) values[col.key] = text;
  }
  if (errors.length) return { ok: false, error: "กรุณาแก้ข้อมูลที่ไม่ถูกต้อง", errors };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_candidate", {
    p_batch: batchId,
    p_candidate: candidateId,
    p_values: values,
    p_reason: reason,
  });
  refresh(batchId);
  if (error) return { ok: false, error: explainError(error) };
  const result = data as { ok: boolean; errors: CandidateError[]; id?: string; status?: string; candidate_code?: string | null };
  if (!result.ok) return { ok: false, error: "ยังบันทึกไม่ได้ กรุณาแก้ตามรายการ", errors: result.errors };
  const note =
    result.status === "ok"
      ? result.candidate_code
        ? ` รหัสผู้สมัคร ${result.candidate_code}`
        : " (รอยืนยันรายชื่อ)"
      : " แต่ยังมีข้อมูลที่ไม่ผ่าน (แสดงสีแดง)";
  return { ok: true, id: result.id ?? "", message: `${candidateId ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายชื่อแล้ว"}${note}` };
}
