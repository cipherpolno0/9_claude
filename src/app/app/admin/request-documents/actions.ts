"use server";

import { revalidatePath } from "next/cache";

import { explainError, type ActionResult } from "@/lib/errors";
import { isPlaceRequestType } from "@/lib/place-requests";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/app/admin/request-documents";
const UUID = /^[0-9a-f-]{36}$/i;
const DUPLICATE = "มีเอกสารชื่อนี้ในคำขอชนิดนี้แล้ว";

/** RLS ยอมให้เพิ่มและแก้ไขเฉพาะผู้ดูแลระบบ */
export async function addRequestDocumentType(
  typeKey: string,
  name: string,
  isRequired: boolean,
  sortOrder: number,
): Promise<ActionResult> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!isPlaceRequestType(typeKey)) return { ok: false, error: "ไม่รู้จักชนิดคำขอนี้" };
  if (!clean) return { ok: false, error: "กรุณากรอกชื่อเอกสาร" };
  if (clean.length > 200) return { ok: false, error: "ชื่อเอกสารยาวเกินไป (ไม่เกิน 200 ตัวอักษร)" };
  const supabase = await createClient();
  const { error } = await supabase.from("request_document_types").insert({
    type_key: typeKey,
    name: clean,
    is_required: isRequired,
    sort_order: Number.isInteger(sortOrder) ? sortOrder : 0,
  });
  if (error) return { ok: false, error: error.code === "23505" ? DUPLICATE : explainError(error) };
  revalidatePath(PAGE);
  return { ok: true, message: `เพิ่ม "${clean}" แล้ว` };
}

export async function updateRequestDocumentType(
  id: string,
  changes: { name?: string; isRequired?: boolean; isActive?: boolean; sortOrder?: number },
): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "ไม่พบรายการนี้" };
  const row: Record<string, string | number | boolean> = {};
  if (changes.name !== undefined) {
    const clean = changes.name.trim().replace(/\s+/g, " ");
    if (!clean) return { ok: false, error: "กรุณากรอกชื่อเอกสาร" };
    if (clean.length > 200) return { ok: false, error: "ชื่อเอกสารยาวเกินไป (ไม่เกิน 200 ตัวอักษร)" };
    row.name = clean;
  }
  if (changes.isRequired !== undefined) row.is_required = changes.isRequired;
  if (changes.isActive !== undefined) row.is_active = changes.isActive;
  if (changes.sortOrder !== undefined && Number.isInteger(changes.sortOrder)) row.sort_order = changes.sortOrder;

  const supabase = await createClient();
  const { data, error } = await supabase.from("request_document_types").update(row).eq("id", id).select("id");
  if (error) return { ok: false, error: error.code === "23505" ? DUPLICATE : explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  revalidatePath(PAGE);
  return { ok: true, message: "บันทึกแล้ว" };
}
