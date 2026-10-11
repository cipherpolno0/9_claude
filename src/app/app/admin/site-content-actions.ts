"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireAdmin, requireSiteContentManager } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { explainError } from "@/lib/errors";
import {
  isContactTopic,
  isDownloadCategory,
  SITE_FILE_MAX_BYTES,
  SITE_FILE_TYPES,
  SITE_FILES_BUCKET,
  SITE_TAG,
} from "@/lib/site-content";
import { checkUpload } from "@/lib/security/file-check";
import { createClient } from "@/lib/supabase/server";

/**
 * เนื้อหากลางของเว็บ (บทที่ 30): ข่าวประกาศ ดาวน์โหลด ปฏิทินงานสอบ (ผู้ดูแลระบบและส่วนกลาง)
 * และข้อมูลติดต่อ ผู้รับข้อความ (ผู้ดูแลระบบ) เขียนผ่าน RLS ทุกตารางผูก audit_row_change
 */

type Result = { ok: boolean; message?: string; error?: string; id?: string };

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function refresh(paths: string[]) {
  revalidateTag(SITE_TAG, { expire: 0 });
  for (const p of paths) revalidatePath(p);
}

/** ตรวจไฟล์และอัปโหลดเข้าที่เก็บสาธารณะ site-files คืน path */
async function uploadSiteFile(file: File, folder: string): Promise<{ path: string; mime: string } | { error: string }> {
  // ตรวจชนิดจากเนื้อไฟล์จริงและขนาด (บทที่ 31)
  const checked = await checkUpload(file, SITE_FILE_TYPES, SITE_FILE_MAX_BYTES, "รับเฉพาะไฟล์ PDF, Word, Excel หรือรูป JPG PNG WebP");
  if (!checked.ok) return { error: checked.error };
  const path = `${folder}${randomUUID()}.${checked.ext}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(SITE_FILES_BUCKET).upload(path, file, { contentType: checked.mime, upsert: false });
  if (error) return { error: explainError(error) };
  return { path, mime: checked.mime };
}

const fileName = (file: File) => text(file.name.replace(/[\\/]/g, "_"), 255) || "ไฟล์";

// ---------------------------------------------------------------
// ข่าวประกาศ
// ---------------------------------------------------------------
export async function saveAnnouncement(id: string | null, formData: FormData): Promise<Result> {
  try {
    await requireSiteContentManager();
    const title = text(formData.get("title"), 300);
    if (!title) return { ok: false, error: "กรุณากรอกหัวข้อข่าว" };
    const publishedOn = isoDate(formData.get("published_on"));
    if (!publishedOn) return { ok: false, error: "กรุณากรอกวันเผยแพร่ให้ครบ" };
    const expiresRaw = String(formData.get("expires_on") ?? "");
    const expiresOn = expiresRaw ? isoDate(expiresRaw) : null;
    if (expiresRaw && !expiresOn) return { ok: false, error: "วันหมดอายุไม่ถูกต้อง" };
    if (formData.get("expires_on_incomplete") === "1" || formData.get("published_on_incomplete") === "1") {
      return { ok: false, error: "กรอกวันที่ให้ครบทั้งวัน เดือน ปี" };
    }
    if (expiresOn && expiresOn < publishedOn) return { ok: false, error: "วันหมดอายุต้องไม่ก่อนวันเผยแพร่" };
    const row = {
      title,
      body: String(formData.get("body") ?? "").slice(0, 20000),
      is_pinned: formData.get("is_pinned") === "on",
      published_on: publishedOn,
      expires_on: expiresOn,
    };
    const supabase = await createClient();
    let annId = id;
    if (id) {
      if (!isUuid(id)) return { ok: false, error: "ไม่พบข่าวนี้" };
      const { data, error } = await supabase.from("announcements").update(row).eq("id", id).select("id");
      if (error) return { ok: false, error: explainError(error) };
      if (!data?.length) return { ok: false, error: "ไม่พบข่าวนี้ หรือท่านไม่มีสิทธิ์แก้ไข" };
    } else {
      const { data, error } = await supabase.from("announcements").insert(row).select("id").single();
      if (error) return { ok: false, error: explainError(error) };
      annId = (data as { id: string }).id;
    }
    // ไฟล์แนบ (ไม่บังคับ หลายไฟล์)
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files.slice(0, 10)) {
      const up = await uploadSiteFile(file, `announcements/${annId}/`);
      if ("error" in up) {
        refresh(["/", "/app/admin/announcements"]);
        return { ok: false, error: `บันทึกข่าวแล้ว แต่แนบไฟล์ ${file.name} ไม่สำเร็จ: ${up.error}`, id: annId ?? undefined };
      }
      const { error } = await supabase.from("announcement_files").insert({
        announcement_id: annId,
        storage_path: up.path,
        file_name: fileName(file),
        mime_type: up.mime,
        size_bytes: file.size,
      });
      if (error) return { ok: false, error: explainError(error), id: annId ?? undefined };
    }
    refresh(["/", "/app/admin/announcements"]);
    return { ok: true, message: id ? "บันทึกการแก้ไขแล้ว" : "เพิ่มข่าวแล้ว", id: annId ?? undefined };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

export async function setAnnouncementActive(id: string, active: boolean): Promise<Result> {
  await requireSiteContentManager();
  if (!isUuid(id)) return { ok: false, error: "ไม่พบข่าวนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("announcements").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ไม่พบข่าวนี้" };
  refresh(["/", "/app/admin/announcements"]);
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว (ไม่แสดงบนหน้าแรก)" };
}

export async function setAnnouncementFileActive(id: string, active: boolean): Promise<Result> {
  await requireSiteContentManager();
  if (!isUuid(id)) return { ok: false, error: "ไม่พบไฟล์" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("announcement_files").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ไม่พบไฟล์" };
  refresh(["/", "/app/admin/announcements"]);
  return { ok: true, message: active ? "นำไฟล์กลับมาแล้ว" : "นำไฟล์ออกแล้ว" };
}

// ---------------------------------------------------------------
// ดาวน์โหลด
// ---------------------------------------------------------------
export async function saveDownload(id: string | null, formData: FormData): Promise<Result> {
  try {
    await requireSiteContentManager();
    const category = String(formData.get("category") ?? "");
    if (!isDownloadCategory(category)) return { ok: false, error: "กรุณาเลือกหมวด" };
    const title = text(formData.get("title"), 300);
    if (!title) return { ok: false, error: "กรุณากรอกชื่อรายการ" };
    const url = text(formData.get("url"), 1000);
    const file = formData.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" };
    if (url && hasFile) return { ok: false, error: "เลือกอย่างใดอย่างหนึ่ง: แนบไฟล์ หรือใส่ลิงก์" };
    if (!id && !url && !hasFile) return { ok: false, error: "กรุณาแนบไฟล์หรือใส่ลิงก์" };
    const sortOrder = Number(formData.get("sort_order") ?? 0);
    const row: Record<string, unknown> = {
      category,
      title,
      description: text(formData.get("description"), 1000),
      sort_order: Number.isInteger(sortOrder) ? Math.max(-9999, Math.min(9999, sortOrder)) : 0,
    };
    if (hasFile) {
      const up = await uploadSiteFile(file, "downloads/");
      if ("error" in up) return { ok: false, error: up.error };
      Object.assign(row, { storage_path: up.path, file_name: fileName(file), mime_type: up.mime, size_bytes: file.size, url: null });
    } else if (url) {
      Object.assign(row, { storage_path: null, file_name: null, mime_type: null, size_bytes: null, url });
    }
    const supabase = await createClient();
    if (id) {
      if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการนี้" };
      const { data, error } = await supabase.from("downloads").update(row).eq("id", id).select("id");
      if (error) return { ok: false, error: explainError(error) };
      if (!data?.length) return { ok: false, error: "ไม่พบรายการนี้ หรือท่านไม่มีสิทธิ์แก้ไข" };
    } else {
      const { error } = await supabase.from("downloads").insert(row);
      if (error) return { ok: false, error: explainError(error) };
    }
    refresh(["/downloads", "/app/admin/downloads"]);
    return { ok: true, message: id ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายการแล้ว" };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

export async function setDownloadActive(id: string, active: boolean): Promise<Result> {
  await requireSiteContentManager();
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("downloads").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ไม่พบรายการนี้" };
  refresh(["/downloads", "/app/admin/downloads"]);
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว (ไม่แสดงบนหน้าดาวน์โหลด)" };
}

// ---------------------------------------------------------------
// ปฏิทินงานสอบ (รายการที่เพิ่มเอง)
// ---------------------------------------------------------------
export async function saveCalendarEvent(id: string | null, yearId: string, formData: FormData): Promise<Result> {
  await requireSiteContentManager();
  if (!isUuid(yearId)) return { ok: false, error: "กรุณาเลือกปีการศึกษา" };
  const title = text(formData.get("title"), 300);
  if (!title) return { ok: false, error: "กรุณากรอกชื่อรายการ" };
  if (formData.get("starts_on_incomplete") === "1" || formData.get("ends_on_incomplete") === "1") {
    return { ok: false, error: "กรอกวันที่ให้ครบทั้งวัน เดือน ปี" };
  }
  const startsOn = isoDate(formData.get("starts_on"));
  if (!startsOn) return { ok: false, error: "กรุณากรอกวันที่" };
  const endsRaw = String(formData.get("ends_on") ?? "");
  const endsOn = endsRaw ? isoDate(endsRaw) : null;
  if (endsOn && endsOn < startsOn) return { ok: false, error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" };
  const row = { academic_year_id: yearId, title, starts_on: startsOn, ends_on: endsOn, note: text(formData.get("note"), 1000) };
  const supabase = await createClient();
  if (id) {
    if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการนี้" };
    const { data, error } = await supabase.from("exam_calendar_events").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: explainError(error) };
    if (!data?.length) return { ok: false, error: "ไม่พบรายการนี้" };
  } else {
    const { error } = await supabase.from("exam_calendar_events").insert(row);
    if (error) return { ok: false, error: explainError(error) };
  }
  refresh(["/", "/app/admin/calendar"]);
  return { ok: true, message: id ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายการแล้ว" };
}

export async function setCalendarEventActive(id: string, active: boolean): Promise<Result> {
  await requireSiteContentManager();
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("exam_calendar_events").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ไม่พบรายการนี้" };
  refresh(["/", "/app/admin/calendar"]);
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว" };
}

// ---------------------------------------------------------------
// ติดต่อเรา (ผู้ดูแลระบบ)
// ---------------------------------------------------------------
export async function saveContactSettings(formData: FormData): Promise<Result> {
  await requireAdmin();
  const lat = text(formData.get("latitude"), 20);
  const lng = text(formData.get("longitude"), 20);
  if ((lat === "") !== (lng === "")) return { ok: false, error: "กรอกพิกัดให้ครบทั้งละติจูดและลองจิจูด (หรือเว้นว่างทั้งคู่)" };
  const latN = lat === "" ? null : Number(lat);
  const lngN = lng === "" ? null : Number(lng);
  if ((latN !== null && (!Number.isFinite(latN) || latN < -90 || latN > 90)) || (lngN !== null && (!Number.isFinite(lngN) || lngN < -180 || lngN > 180))) {
    return { ok: false, error: "พิกัดไม่ถูกต้อง (ละติจูด -90 ถึง 90 ลองจิจูด -180 ถึง 180)" };
  }
  const email = text(formData.get("email"), 200);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "รูปแบบอีเมลไม่ถูกต้อง" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_contact")
    .update({
      agency_name: text(formData.get("agency_name"), 300),
      address: text(formData.get("address"), 1000),
      phone: text(formData.get("phone"), 200),
      email,
      office_hours: text(formData.get("office_hours"), 500),
      latitude: latN,
      longitude: lngN,
      map_note: text(formData.get("map_note"), 300),
    })
    .eq("id", 1)
    .select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "เฉพาะผู้ดูแลระบบ" };
  refresh(["/contact", "/app/admin/contact"]);
  return { ok: true, message: "บันทึกข้อมูลติดต่อแล้ว" };
}

export async function addTopicRecipient(topic: string, kind: "role" | "user", value: string): Promise<Result> {
  await requireAdmin();
  if (!isContactTopic(topic)) return { ok: false, error: "หัวข้อไม่ถูกต้อง" };
  if (kind === "user" ? !isUuid(value) : !/^[a-z_]+$/.test(value)) return { ok: false, error: kind === "user" ? "กรุณาเลือกผู้ใช้" : "กรุณาเลือกบทบาท" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_topic_recipients")
    .insert(kind === "user" ? { topic_key: topic, user_id: value } : { topic_key: topic, role_key: value });
  if (error) return { ok: false, error: error.code === "23505" ? "หัวข้อนี้มีผู้รับรายนี้อยู่แล้ว" : explainError(error) };
  revalidatePath("/app/admin/contact");
  return { ok: true, message: "เพิ่มผู้รับแล้ว" };
}

export async function removeTopicRecipient(id: string): Promise<Result> {
  await requireAdmin();
  if (!isUuid(id)) return { ok: false, error: "ไม่พบรายการ" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("contact_topic_recipients").update({ is_active: false }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ไม่พบรายการ" };
  revalidatePath("/app/admin/contact");
  return { ok: true, message: "นำผู้รับออกแล้ว" };
}
