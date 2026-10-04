"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/form";
import type { ImportPreviewResult } from "@/components/import-dialog";
import { uploadAttachment } from "@/lib/attachments/actions";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from "@/lib/attachments/config";
import { explainError, type ActionResult } from "@/lib/errors";
import { readUploadedSheet } from "@/lib/excel";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import {
  END_REASONS,
  PERSON_IMPORT_HEADERS,
  PERSON_IMPORT_MAX_ROWS,
  cleanNationalId,
  todayIso,
  validNationalId,
  validatePersonImportRows,
  type EndReason,
  type PersonImportRaw,
  type PersonImportRow,
} from "@/lib/persons";
import { isUuid } from "@/lib/persons-server";
import { isNoticeType, isStatusType } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";

const LIST = "/app/personnel";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

// ------------------------------------------------------------------
// บุคคล
// ------------------------------------------------------------------

/** เพิ่มหรือแก้ไขบุคคล (ช่อง id ว่าง = เพิ่มใหม่) สิทธิ์และการเข้ารหัสทำในฐานข้อมูล */
export async function savePerson(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const personType = text(formData, "person_type");
  const nationalId = cleanNationalId(text(formData, "national_id"));

  if (personType !== "monastic" && personType !== "lay") return { error: "กรุณาเลือกประเภทบุคคล" };
  if (!text(formData, "first_name")) return { error: "กรุณากรอกชื่อ" };
  if (!text(formData, "org_unit_id")) return { error: "กรุณาเลือกเขตปกครองที่วัดตั้งอยู่" };
  if (text(formData, "birth_date_incomplete")) return { error: "วันเกิดยังกรอกไม่ครบหรือไม่ใช่วันที่ที่มีจริง" };
  if (text(formData, "ordination_date_incomplete")) return { error: "วันอุปสมบทยังกรอกไม่ครบหรือไม่ใช่วันที่ที่มีจริง" };
  if (nationalId && !validNationalId(nationalId)) {
    return { error: "เลขประจำตัวประชาชนไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลัก และหลักสุดท้ายต้องตรงตามสูตรตรวจสอบ)" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_person", {
    p_id: id || null,
    p_data: {
      person_type: personType,
      title: text(formData, "title"),
      first_name: text(formData, "first_name"),
      monastic_name: text(formData, "monastic_name"),
      last_name: text(formData, "last_name"),
      birth_date: text(formData, "birth_date"),
      national_id: nationalId,
      clear_national_id: formData.get("clear_national_id") === "on",
      ordination_date: text(formData, "ordination_date"),
      nak_tham: text(formData, "nak_tham"),
      pali_grade: text(formData, "pali_grade"),
      general_education: text(formData, "general_education"),
      temple_name: text(formData, "temple_name"),
      org_unit_id: text(formData, "org_unit_id"),
      phone: text(formData, "phone"),
      status: text(formData, "status") || "active",
      note: text(formData, "note"),
    },
  });
  if (error) return { error: explainError(error) };

  revalidatePath(LIST);
  revalidatePath(`${LIST}/${data}`);
  redirect(`${LIST}/${data}?saved=1`);
}

/** ปิดหรือเปิดใช้งานบุคคล (ไม่ลบข้อมูลจริง) */
export async function setPersonActive(id: string, active: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "ไม่พบบุคคลนี้" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_person_active", { p_id: id, p_active: active });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${id}`);
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว" };
}

/** อัปโหลดรูปถ่ายของบุคคล (ใช้ที่เก็บไฟล์แนบกลาง รับเฉพาะ JPG และ PNG) */
export async function uploadPersonPhoto(formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  const personId = text(formData, "person_id");
  if (!isUuid(personId)) return { ok: false, error: "ไม่พบบุคคลนี้" };
  if (!(file instanceof File) || !["image/jpeg", "image/png"].includes(file.type)) {
    return { ok: false, error: "รูปถ่ายต้องเป็นไฟล์ JPG หรือ PNG" };
  }
  const upload = new FormData();
  upload.set("file", file);
  upload.set("entity_table", "person_photos");
  upload.set("entity_id", personId);
  const result = await uploadAttachment(upload);
  if (result.ok) revalidatePath(`${LIST}/${personId}`);
  return result.ok ? { ok: true, message: "บันทึกรูปถ่ายแล้ว" } : result;
}

// ------------------------------------------------------------------
// ตำแหน่ง (หนึ่งแถว = หนึ่งวาระ ไม่เขียนทับ)
// ------------------------------------------------------------------

export async function addAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const personId = text(formData, "person_id");
  const positionKey = text(formData, "position_type_key");
  const orgUnitId = text(formData, "org_unit_id");
  const appointedOn = text(formData, "appointed_on");

  if (!isUuid(personId)) return { error: "ไม่พบบุคคลนี้" };
  if (!positionKey) return { error: "กรุณาเลือกตำแหน่ง" };
  if (!isUuid(orgUnitId)) return { error: "กรุณาเลือกเขตปกครองของตำแหน่งให้ถึงระดับของตำแหน่งนั้น" };
  if (!appointedOn) return { error: "กรุณากรอกวันที่แต่งตั้งให้ครบ (วัน เดือน ปี พ.ศ.)" };

  const supabase = await createClient();
  const { error } = await supabase.from("appointments").insert({
    person_id: personId,
    position_type_key: positionKey,
    org_unit_id: orgUnitId,
    appointed_on: appointedOn,
    order_no: text(formData, "order_no"),
  });
  if (error) {
    return {
      error:
        error.code === "42501"
          ? "ท่านไม่มีสิทธิ์บันทึกตำแหน่งในเขตปกครองนี้ (บันทึกได้เฉพาะเลขานุการของเขตนั้นหรือหน่วยเหนือ)"
          : explainError(error),
    };
  }
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${personId}`);
  return { message: "บันทึกตำแหน่งแล้ว แนบไฟล์คำสั่งหรือตราตั้งได้ที่รายการด้านล่าง" };
}

export async function endAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const personId = text(formData, "person_id");
  const endedOn = text(formData, "ended_on");
  const reason = text(formData, "end_reason") as EndReason;
  const note = text(formData, "end_note");

  if (!isUuid(id)) return { error: "ไม่พบรายการนี้" };
  if (!endedOn) return { error: "กรุณากรอกวันพ้นตำแหน่งให้ครบ (วัน เดือน ปี พ.ศ.)" };
  if (endedOn > todayIso()) return { error: "วันพ้นตำแหน่งต้องไม่เป็นวันในอนาคต" };
  if (!END_REASONS.includes(reason)) return { error: "กรุณาเลือกเหตุที่พ้นตำแหน่ง" };
  if (reason === "other" && !note) return { error: "กรุณาระบุเหตุที่พ้นตำแหน่ง" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ ended_on: endedOn, end_reason: reason, end_note: note })
    .eq("id", id)
    .eq("is_active", true)
    .select("id");
  if (error) {
    return {
      error: error.message.includes("appointments_dates")
        ? "วันพ้นตำแหน่งต้องไม่อยู่ก่อนวันที่แต่งตั้ง"
        : explainError(error),
    };
  }
  if (!data?.length) return { error: "ท่านไม่มีสิทธิ์แก้ไขรายการนี้" };
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${personId}`);
  return { message: "บันทึกการพ้นตำแหน่งแล้ว" };
}

/** ยกเลิกรายการที่บันทึกผิด (ปิดใช้งาน ไม่ลบจริง) */
export async function cancelAppointment(id: string, personId: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").update({ is_active: false }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขรายการนี้" };
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${personId}`);
  return { ok: true, message: "ยกเลิกรายการแล้ว" };
}

// ------------------------------------------------------------------
// นำเข้าจาก Excel: ขั้นที่ 1 อ่านและตรวจ (ยังไม่บันทึก) ขั้นที่ 2 ยืนยัน
// ------------------------------------------------------------------

async function checkRows(raw: PersonImportRaw[]): Promise<PersonImportRow[]> {
  const units = new Map(
    (await fetchAccessibleUnits()).filter((u) => u.selectable).map((u) => [u.code, { id: u.id, level: u.level }]),
  );
  const rows = validatePersonImportRows(raw, units);

  // ถามฐานข้อมูลว่าแถวใดมีในทะเบียนแล้ว (ตอบเพียง ใช่/ไม่ใช่)
  const candidates = rows.filter((r) => r.status === "new" && r.data);
  if (candidates.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_persons_import", {
      p_rows: candidates.map((r) => ({
        row_number: r.rowNumber,
        national_id: r.data!.national_id,
        first_name: r.data!.first_name,
        monastic_name: r.data!.monastic_name,
        last_name: r.data!.last_name,
        birth_date: r.data!.birth_date,
      })),
    });
    if (error) throw error;
    const duplicates = new Set(
      ((data as { row_number: number; duplicate: boolean }[] | null) ?? [])
        .filter((d) => d.duplicate)
        .map((d) => d.row_number),
    );
    for (const row of candidates) {
      if (duplicates.has(row.rowNumber)) {
        row.status = "skip";
        row.message = "มีบุคคลนี้ในทะเบียนแล้ว";
      }
    }
  }
  return rows;
}

export async function previewPersonImport(formData: FormData): Promise<ImportPreviewResult<PersonImportRaw[]>> {
  try {
    const sheet = await readUploadedSheet(formData, PERSON_IMPORT_HEADERS, PERSON_IMPORT_MAX_ROWS);
    if (!sheet.ok) return sheet;
    const rows = await checkRows(sheet.rows);
    return {
      ok: true,
      rows: rows.map(({ rowNumber, cells, status, message }) => ({ rowNumber, cells, status, message })),
      payload: sheet.rows,
    };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

export async function confirmPersonImport(raw: PersonImportRaw[]): Promise<ActionResult> {
  try {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > PERSON_IMPORT_MAX_ROWS) {
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
    const fresh = rows.filter((r) => r.status === "new");
    if (errors > 0) return { ok: false, error: `ยังมีแถวที่ผิด ${errors} แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่` };
    if (fresh.length === 0) return { ok: false, error: "ไม่มีแถวใหม่ให้นำเข้า" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_persons", { p_rows: fresh.map((r) => r.data) });
    if (error) return { ok: false, error: explainError(error) };
    revalidatePath(LIST);
    return { ok: true, message: `นำเข้าแล้ว ${Number(data).toLocaleString("th-TH")} รายการ` };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

// ------------------------------------------------------------------
// จศป. (หนึ่งแถว = บุคคลหนึ่งรูปหรือคน ในแท่งหนึ่ง ที่สำนักหนึ่ง)
// ------------------------------------------------------------------

/** เพิ่ม (ช่อง id ว่าง) หรือแก้ไขรายการ จศป. สิทธิ์และกติกาตรวจที่ฐานข้อมูล */
export async function saveEducationStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const personId = text(formData, "person_id");
  const track = text(formData, "track");
  const positionTypeId = text(formData, "position_type_id");
  const orgUnitId = text(formData, "org_unit_id");
  const status = text(formData, "status") || "active";
  const startedOn = text(formData, "started_on");
  const endedOn = status === "ended" ? text(formData, "ended_on") : "";

  if (!isUuid(personId)) return { error: "ไม่พบบุคคลนี้" };
  if (!["dhamma", "pali", "general", "supervisor"].includes(track)) return { error: "กรุณาเลือกแท่ง" };
  if (!isUuid(positionTypeId)) return { error: "กรุณาเลือกประเภทตำแหน่ง" };
  if (!isUuid(orgUnitId)) return { error: "กรุณาเลือกเขตที่รับผิดชอบ" };
  if (!["active", "suspended", "ended"].includes(status)) return { error: "สถานะไม่ถูกต้อง" };
  if (text(formData, "started_on_incomplete")) return { error: "วันที่เริ่มยังกรอกไม่ครบหรือไม่ใช่วันที่ที่มีจริง" };
  if (status === "ended" && text(formData, "ended_on_incomplete")) {
    return { error: "วันที่พ้นหน้าที่ยังกรอกไม่ครบหรือไม่ใช่วันที่ที่มีจริง" };
  }
  if (startedOn && endedOn && endedOn < startedOn) return { error: "วันที่พ้นหน้าที่ต้องไม่อยู่ก่อนวันที่เริ่ม" };

  const row = {
    position_type_id: positionTypeId,
    school_name: text(formData, "school_name"),
    school_type: text(formData, "school_type"),
    org_unit_id: orgUnitId,
    started_on: startedOn || null,
    order_no: text(formData, "order_no"),
    subjects: text(formData, "subjects"),
    status,
    ended_on: endedOn || null,
    note: text(formData, "note"),
  };

  const supabase = await createClient();
  const denied = "ท่านไม่มีสิทธิ์บันทึก จศป. ในเขตปกครองนี้ (บันทึกได้เฉพาะเลขานุการของเขตนั้นหรือหน่วยเหนือ)";
  if (id) {
    if (!isUuid(id)) return { error: "ไม่พบรายการนี้" };
    const { data, error } = await supabase.from("education_staff").update(row).eq("id", id).eq("is_active", true).select("id");
    if (error) return { error: error.code === "42501" ? denied : explainError(error) };
    if (!data?.length) return { error: "ท่านไม่มีสิทธิ์แก้ไขรายการนี้" };
  } else {
    const { error } = await supabase.from("education_staff").insert({ ...row, person_id: personId, track });
    if (error) return { error: error.code === "42501" ? denied : explainError(error) };
  }
  revalidatePath(`${LIST}/education`);
  revalidatePath(`${LIST}/${personId}`);
  return { message: id ? "บันทึกการแก้ไขแล้ว" : "บันทึกแล้ว แนบไฟล์คำสั่งแต่งตั้งได้ที่รายการด้านล่าง" };
}

/** ยกเลิกรายการ จศป. ที่บันทึกผิด (ปิดใช้งาน ไม่ลบจริง) */
export async function cancelEducationStaff(id: string, personId: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("education_staff").update({ is_active: false }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขรายการนี้" };
  revalidatePath(`${LIST}/education`);
  revalidatePath(`${LIST}/${personId}`);
  return { ok: true, message: "ยกเลิกรายการแล้ว" };
}

/** ผูกหรือเลิกผูกบัญชีผู้ใช้กับบุคคล (อีเมลว่าง = เลิกผูก) เพื่อให้เจ้าของประวัติเปิดหน้า ประวัติของฉัน ได้ */
export async function linkPersonUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const personId = text(formData, "person_id");
  const email = text(formData, "email");
  if (!isUuid(personId)) return { error: "ไม่พบบุคคลนี้" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_person_user", { p_person_id: personId, p_email: email });
  if (error) return { error: explainError(error) };
  revalidatePath(`${LIST}/${personId}`);
  return { message: email ? "ผูกบัญชีแล้ว ระบบแจ้งเจ้าของบัญชีให้ทราบแล้ว" : "เลิกผูกบัญชีแล้ว" };
}

// ------------------------------------------------------------------
// คำขอเปลี่ยนสถานะ (ขอย้าย ลาออก) และการแจ้ง (มรณภาพ-ตาย ลาสิกขา พ้นตำแหน่งด้วยเหตุอื่น)
// ------------------------------------------------------------------

/** ยื่นคำขอหรือบันทึกการแจ้งผ่านเครื่องอนุมัติกลาง แนบหลักฐาน (ถ้ามี) แล้วพาไปหน้าคำขอ */
export async function submitStatusRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const personId = text(formData, "person_id");
  const type = text(formData, "type");
  const effectiveOn = text(formData, "effective_on");
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (!isUuid(personId)) return { error: "ไม่พบบุคคลนี้" };
  if (!isStatusType(type)) return { error: "กรุณาเลือกเรื่องที่จะยื่น" };
  if (!effectiveOn) return { error: "กรุณากรอกวันที่ให้ครบ (วัน เดือน ปี พ.ศ.)" };
  if (type === "transfer" && !isUuid(text(formData, "to_unit_id"))) return { error: "กรุณาเลือกหน่วยปลายทาง" };
  if ((type === "resign" || type === "other_exit_notice") && !text(formData, "detail")) {
    return { error: "กรุณาระบุเหตุผล" };
  }
  // ตรวจไฟล์ก่อนสร้างคำขอ เพื่อไม่ให้เกิดคำขอที่ไม่มีหลักฐาน
  if (isNoticeType(type) && !hasFile) return { error: "กรุณาแนบหลักฐาน (PDF รูปภาพ Excel หรือ Word)" };
  if (hasFile) {
    if (!ATTACHMENT_TYPES[file.type]) return { error: "ไฟล์แนบรับเฉพาะ PDF รูปภาพ (JPG, PNG) Excel และ Word" };
    if (file.size > ATTACHMENT_MAX_BYTES) return { error: "ไฟล์แนบใหญ่เกิน 10 MB" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_status_request", {
    p_person_id: personId,
    p_type: type,
    p_data: {
      effective_on: effectiveOn,
      detail: text(formData, "detail"),
      to_unit_id: text(formData, "to_unit_id"),
      from_place: text(formData, "from_place"),
      to_place: text(formData, "to_place"),
    },
  });
  if (error) return { error: explainError(error) };
  const requestId = data as string;

  let uploadFailed = false;
  if (hasFile) {
    const upload = new FormData();
    upload.set("file", file);
    upload.set("entity_table", "requests");
    upload.set("entity_id", requestId);
    uploadFailed = !(await uploadAttachment(upload)).ok;
  }

  revalidatePath(LIST);
  revalidatePath(`${LIST}/${personId}`);
  revalidatePath(`${LIST}/requests`);
  revalidatePath("/app/me");
  redirect(`/app/approvals/${requestId}${uploadFailed ? "?upload=failed" : ""}`);
}
