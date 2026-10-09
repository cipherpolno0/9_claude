"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { explainError, type ActionResult } from "@/lib/errors";
import { fetchFormTemplate, fetchTemplateContext } from "@/lib/exam-forms-server";
import { uploadLimits } from "@/lib/exam-batches-server";
import { parseRegistrationFile } from "@/lib/exam-upload";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const BUCKET = "registration-files";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type UploadResult = { ok: true; id: string } | { ok: false; error: string; details?: string[] };

/**
 * ขั้น ก.-ข.: รับไฟล์ ตรวจโครงแฟ้ม อ่านทุกแถว เก็บไฟล์ต้นฉบับ แล้วให้ฐานข้อมูลตรวจรายแถวและสร้างชุด (ร่าง)
 * formData: round, place, venue, file
 */
export async function uploadRegistration(formData: FormData): Promise<UploadResult> {
  try {
    const roundId = String(formData.get("round") ?? "");
    const placeId = String(formData.get("place") ?? "");
    const venueId = String(formData.get("venue") ?? "");
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

    const { data, error } = await supabase.rpc("create_registration_batch", {
      p_round: roundId,
      p_place: placeId,
      p_venue: venueId,
      p_file: { name: file.name.slice(0, 200), path, size: file.size },
      p_rows: parsed.rows,
    });
    if (error || !data) {
      await supabase.storage.from(BUCKET).remove([path]);
      return { ok: false, error: explainError(error) };
    }
    revalidatePath("/app/exams/batches");
    return { ok: true, id: String(data) };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

/** ขั้น ง.: ยืนยันชุด (onlyOk = บันทึกเฉพาะแถวที่ผ่าน) */
export async function confirmBatch(batchId: string, onlyOk: boolean): Promise<ActionResult> {
  if (!UUID.test(batchId)) return { ok: false, error: "ไม่พบชุดรายชื่อ" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_registration_batch", { p_batch: batchId, p_only_ok: onlyOk });
  revalidatePath(`/app/exams/batches/${batchId}`);
  revalidatePath("/app/exams/batches");
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
  if (!UUID.test(batchId)) return { ok: false, error: "ไม่พบชุดรายชื่อ" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_registration_batch", { p_batch: batchId, p_reason: reason.trim().slice(0, 500) });
  revalidatePath(`/app/exams/batches/${batchId}`);
  revalidatePath("/app/exams/batches");
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true, message: "ถอนชุดรายชื่อแล้ว" };
}
