"use server";

import { randomUUID } from "node:crypto";

import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import { ATTACHMENT_BUCKET, ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, type Attachment } from "./config";

/** ไฟล์แนบของรายการหนึ่ง (เห็นเฉพาะที่ RLS อนุญาต) */
export async function listAttachments(entityTable: string, entityId: string): Promise<Attachment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments")
    .select("id, file_name, mime_type, size_bytes, uploaded_by, created_at, doc_type_id")
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId)
    .eq("is_active", true)
    .order("created_at");
  return (data as Attachment[] | null) ?? [];
}

/** อัปโหลดไฟล์แนบ: formData ต้องมี file, entity_table, entity_id และ org_unit_id (ถ้ามี) doc_type_id = รายการเอกสารของคำขอ (ถ้ามี) */
export async function uploadAttachment(formData: FormData): Promise<ActionResult> {
  try {
    const file = formData.get("file");
    const entityTable = String(formData.get("entity_table") ?? "");
    const entityId = String(formData.get("entity_id") ?? "");
    const orgUnitId = String(formData.get("org_unit_id") ?? "") || null;
    const docTypeId = String(formData.get("doc_type_id") ?? "");

    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์" };
    const ext = ATTACHMENT_TYPES[file.type];
    if (!ext) return { ok: false, error: "รับเฉพาะไฟล์ PDF รูปภาพ (JPG, PNG) Excel และ Word" };
    if (file.size > ATTACHMENT_MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
    if (!entityTable || !entityId) return { ok: false, error: "ไม่ทราบว่าแนบกับรายการใด" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

    // เก็บในโฟลเดอร์ของผู้อัปโหลด ชื่อไฟล์จริงเก็บในตาราง ไม่ใช้เป็นชื่อในที่เก็บ
    const path = `${user.id}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { ok: false, error: explainError(uploadError) };

    const { error } = await supabase.from("attachments").insert({
      entity_table: entityTable,
      entity_id: entityId,
      org_unit_id: orgUnitId,
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
      ...(/^[0-9a-f-]{36}$/i.test(docTypeId) ? { doc_type_id: docTypeId } : {}),
    });
    if (error) {
      await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
      return { ok: false, error: explainError(error) };
    }
    return { ok: true, message: `แนบไฟล์ ${file.name} แล้ว` };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

/** ลิงก์ดาวน์โหลดชั่วคราว (5 นาที) ออกให้เฉพาะผู้ที่ RLS ให้เห็นไฟล์นั้น */
export async function getAttachmentUrl(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: row } = await supabase
      .from("attachments")
      .select("storage_path, file_name")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();
    if (!row) return { ok: false, error: "ไม่พบไฟล์ หรือท่านไม่มีสิทธิ์ดาวน์โหลด" };

    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(row.storage_path, 300, { download: row.file_name });
    if (error || !data) return { ok: false, error: explainError(error) };
    return { ok: true, url: data.signedUrl };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

/** เอาไฟล์แนบออก (ปิดใช้งาน ไม่ลบจริง) ทำได้เฉพาะผู้อัปโหลดและผู้ดูแลระบบ */
export async function removeAttachment(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("attachments").update({ is_active: false }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์เอาไฟล์นี้ออก" };
  return { ok: true, message: "เอาไฟล์แนบออกแล้ว" };
}
