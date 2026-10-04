"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/form";
import type { PickerItem } from "@/components/search-picker";
import { explainError, type ActionResult } from "@/lib/errors";
import { isUuid } from "@/lib/persons-server";
import { PLACE_TYPE_LABEL, type PlaceType } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import {
  VENUE_LEVELS,
  VENUE_STATUSES,
  VENUE_TYPE_LABEL,
  isOfficerRole,
  isVenueType,
  OFFICER_ROLE_LABEL,
  type VenueType,
} from "@/lib/venues";

const LIST = "/app/places/venues";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const clean = (q: string) => q.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

function explainVenueError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") {
    return error.message?.includes("venue_officers_one_per_role")
      ? "สนามสอบนี้มีผู้ทำหน้าที่ในบทบาทนี้ของปีการศึกษานี้แล้ว (มีได้อย่างละ 1)"
      : "รหัสสนามสอบนี้มีในทะเบียนแล้ว กรุณาใช้รหัสอื่น";
  }
  if (error.code === "42501") return "ท่านไม่มีสิทธิ์แก้ไขสนามสอบในเขตปกครองนี้";
  if (error.code === "23514" && error.message?.includes("contact_phone")) {
    return "เบอร์ติดต่อใช้ได้เฉพาะตัวเลข ช่องว่าง และเครื่องหมาย + - ( )";
  }
  return explainError(error);
}

/** เพิ่มหรือแก้ไขสนามสอบ (ช่อง id ว่าง = เพิ่มใหม่) สิทธิ์และกติกาตรวจในฐานข้อมูล (RLS และ trigger exam_venues_rules) */
export async function saveVenue(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const type = text(formData, "venue_type");
  const status = text(formData, "status") || "open";
  const capacity = text(formData, "capacity");
  const startYear = text(formData, "start_year_be");
  const levels = VENUE_LEVELS.filter((l) => formData.getAll("levels").includes(l));
  const movedTo = text(formData, "moved_to_venue_id");

  if (!text(formData, "code")) return { error: "กรุณากรอกรหัสสนามสอบ" };
  if (!text(formData, "name")) return { error: "กรุณากรอกชื่อสนามสอบ" };
  if (!isVenueType(type)) return { error: "กรุณาเลือกประเภทสนามสอบ" };
  if (!isUuid(text(formData, "place_id"))) return { error: "กรุณาเลือกสถานที่ตั้งจากทะเบียนสถานที่" };
  if (!isUuid(text(formData, "org_unit_id"))) return { error: "กรุณาเลือกเขตปกครองคณะสงฆ์ที่สังกัด" };
  if (levels.length === 0) return { error: "กรุณาเลือกชั้นที่เปิดสอบอย่างน้อย 1 ชั้น" };
  if (capacity && (!/^\d+$/.test(capacity) || Number(capacity) > 100000)) {
    return { error: "ความจุต้องเป็นเลขจำนวนเต็ม 0 ถึง 100,000" };
  }
  if (startYear && (!/^\d{4}$/.test(startYear) || Number(startYear) < 2400 || Number(startYear) > 2700)) {
    return { error: "ปีการศึกษาที่เริ่มใช้ต้องเป็น พ.ศ. 4 หลัก" };
  }
  if (!(VENUE_STATUSES as readonly string[]).includes(status)) return { error: "สถานะไม่ถูกต้อง" };
  if (movedTo && movedTo === id) return { error: "สนามสอบที่ย้ายไปต้องเป็นคนละแห่งกับสนามนี้" };

  const row = {
    code: text(formData, "code"),
    name: text(formData, "name"),
    venue_type: type,
    place_id: text(formData, "place_id"),
    org_unit_id: text(formData, "org_unit_id"),
    levels,
    capacity: capacity ? Number(capacity) : null,
    status,
    moved_to_venue_id: status === "moved" && isUuid(movedTo) ? movedTo : null,
    start_year_be: startYear ? Number(startYear) : null,
    note: text(formData, "note"),
  };

  const supabase = await createClient();
  let savedId = id;
  if (id) {
    if (!isUuid(id)) return { error: "ไม่พบสนามสอบนี้" };
    const { data, error } = await supabase.from("exam_venues").update(row).eq("id", id).select("id");
    if (error) return { error: explainVenueError(error) };
    if (!data?.length) return { error: "ท่านไม่มีสิทธิ์แก้ไขสนามสอบนี้" };
  } else {
    const { data, error } = await supabase.from("exam_venues").insert(row).select("id").single();
    if (error) return { error: explainVenueError(error) };
    savedId = (data as { id: string }).id;
  }

  revalidatePath(LIST);
  revalidatePath(`${LIST}/${savedId}`);
  redirect(`${LIST}/${savedId}?saved=1`);
}

/** ปิดหรือเปิดใช้งานสนามสอบ (ใช้กับรายการที่บันทึกผิด ไม่ลบข้อมูลจริง) */
export async function setVenueActive(id: string, active: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "ไม่พบสนามสอบนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("exam_venues").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainVenueError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขสนามสอบนี้" };
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${id}`);
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว" };
}

// ------------------------------------------------------------------
// ประธานสนามสอบ และผู้รับข้อสอบ
// ------------------------------------------------------------------

/** บันทึกประธานสนามสอบหรือผู้รับข้อสอบของสนามและปีการศึกษาที่เลือก (ช่อง id ว่าง = เพิ่มใหม่) */
export async function saveVenueOfficer(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const venueId = text(formData, "venue_id");
  const yearId = text(formData, "academic_year_id");
  const role = text(formData, "role");
  const personId = text(formData, "person_id");
  const phone = text(formData, "contact_phone");
  if (!isUuid(venueId) || !isUuid(yearId) || !isOfficerRole(role)) return { error: "ข้อมูลไม่ครบ กรุณาเปิดหน้านี้ใหม่" };
  if (!isUuid(personId)) return { error: `กรุณาเลือก${OFFICER_ROLE_LABEL[role]}จากทะเบียนบุคคล` };
  if (phone && !/^[0-9 +()-]+$/.test(phone)) return { error: "เบอร์ติดต่อใช้ได้เฉพาะตัวเลข ช่องว่าง และเครื่องหมาย + - ( )" };

  const row = {
    person_id: personId,
    delivery_address: text(formData, "delivery_address"),
    contact_phone: phone,
    is_public: formData.get("is_public") === "on",
    note: text(formData, "note"),
  };
  const supabase = await createClient();
  if (id) {
    if (!isUuid(id)) return { error: "ไม่พบรายการนี้" };
    const { data, error } = await supabase.from("venue_officers").update(row).eq("id", id).select("id");
    if (error) return { error: explainVenueError(error) };
    if (!data?.length) return { error: "ท่านไม่มีสิทธิ์แก้ไขสนามสอบนี้" };
  } else {
    const { error } = await supabase
      .from("venue_officers")
      .insert({ ...row, venue_id: venueId, academic_year_id: yearId, role });
    if (error) return { error: explainVenueError(error) };
  }
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${venueId}`);
  return { message: `บันทึก${OFFICER_ROLE_LABEL[role]}แล้ว` };
}

/** นำรายชื่อออกจากสนามสอบของปีนั้น (ปิดใช้งานแถว ไม่ลบข้อมูลจริง) */
export async function removeVenueOfficer(officerId: string, venueId: string): Promise<ActionResult> {
  if (!isUuid(officerId) || !isUuid(venueId)) return { ok: false, error: "ไม่พบรายการนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venue_officers")
    .update({ is_active: false })
    .eq("id", officerId)
    .eq("venue_id", venueId)
    .select("id");
  if (error) return { ok: false, error: explainVenueError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขสนามสอบนี้" };
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${venueId}`);
  return { ok: true, message: "นำรายชื่อออกแล้ว" };
}

export type CopyResult = { fromYear: number; copied: number; skippedFilled: number; skippedPerson: number };

/**
 * คัดลอกรายชื่อประธานและผู้รับข้อสอบจากปีการศึกษาก่อนหน้า (dryRun = นับอย่างเดียว ใช้แสดงก่อนยืนยัน)
 * ฐานข้อมูลคัดลอกเฉพาะสนามที่ผู้ใช้แก้ไขได้ และข้ามบทบาทที่ปีใหม่มีรายชื่อแล้ว
 */
export async function copyVenueOfficers(
  yearId: string,
  unitId: string | null,
  dryRun: boolean,
): Promise<{ ok: true; result: CopyResult } | { ok: false; error: string }> {
  if (!isUuid(yearId)) return { ok: false, error: "กรุณาเลือกปีการศึกษา" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_venue_officers", {
    p_to_year: yearId,
    p_unit: unitId && isUuid(unitId) ? unitId : null,
    p_dry_run: dryRun,
  });
  if (error) return { ok: false, error: explainError(error) };
  const row = (data as { from_year_be: number; copied: number; skipped_filled: number; skipped_person: number }[] | null)?.[0];
  if (!row) return { ok: false, error: "ไม่มีข้อมูลให้คัดลอก" };
  if (!dryRun) revalidatePath(LIST, "layout");
  return {
    ok: true,
    result: {
      fromYear: row.from_year_be,
      copied: row.copied,
      skippedFilled: row.skipped_filled,
      skippedPerson: row.skipped_person,
    },
  };
}

// ------------------------------------------------------------------
// ตัวช่วยของฟอร์ม: ค้นสถานที่ตั้ง และค้นสนามสอบที่ย้ายไป (ทำงานในนามผู้ใช้ อยู่ใต้ RLS)
// ------------------------------------------------------------------

export type PlacePick = { org_unit_id: string };

export async function searchVenuePlaces(q: string): Promise<PickerItem<PlacePick>[]> {
  const term = clean(q);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("id, code, name, place_type, org_unit_id, org_units(name), civil_districts(name, prefix), civil_provinces(name)")
    .eq("is_active", true)
    .or(`name.ilike.%${term}%,code.ilike.%${term}%`)
    .order("name")
    .limit(20);
  type Row = {
    id: string;
    code: string;
    name: string;
    place_type: PlaceType;
    org_unit_id: string;
    org_units: { name: string } | null;
    civil_districts: { name: string; prefix: string } | null;
    civil_provinces: { name: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    detail: [
      PLACE_TYPE_LABEL[p.place_type],
      `รหัส ${p.code}`,
      p.civil_districts ? `${p.civil_districts.prefix}${p.civil_districts.name}` : "",
      p.civil_provinces?.name ?? "",
      p.org_units?.name ?? "",
    ]
      .filter(Boolean)
      .join(" · "),
    data: { org_unit_id: p.org_unit_id },
  }));
}

export async function searchVenues(type: VenueType, excludeId: string, q: string): Promise<PickerItem[]> {
  const term = clean(q);
  if (term.length < 2 || !isVenueType(type)) return [];
  const supabase = await createClient();
  let query = supabase
    .from("exam_venues")
    .select("id, code, name, venue_type")
    .eq("is_active", true)
    .eq("venue_type", type)
    .or(`name.ilike.%${term}%,code.ilike.%${term}%`)
    .order("name")
    .limit(20);
  if (isUuid(excludeId)) query = query.neq("id", excludeId);
  const { data } = await query;
  return ((data as { id: string; code: string; name: string; venue_type: VenueType }[] | null) ?? []).map((v) => ({
    id: v.id,
    label: v.name,
    detail: `${VENUE_TYPE_LABEL[v.venue_type]} · รหัส ${v.code}`,
  }));
}
