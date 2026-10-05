"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/form";
import type { ImportPreviewResult } from "@/components/import-dialog";
import type { PickerItem } from "@/components/search-picker";
import { explainError, type ActionResult } from "@/lib/errors";
import { readUploadedSheet } from "@/lib/excel";
import { SECTS, SECT_LABEL, type Sect } from "@/lib/org-units";
import { personName } from "@/lib/persons";
import { isUuid } from "@/lib/persons-server";
import {
  PLACE_IMPORT_MAX_ROWS,
  PLACE_STATUSES,
  isPlaceType,
  needsParentTemple,
  placeImportHeaders,
  validatePlaceImportRows,
  type CivilOption,
  type PlaceImportRaw,
  type PlaceImportRow,
  type PlaceType,
} from "@/lib/places";
import { REGISTRY_TAG } from "@/lib/registry";
import { createClient } from "@/lib/supabase/server";

const LIST = "/app/places";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const code = (formData: FormData, key: string) => (/^\d+$/.test(text(formData, key)) ? Number(text(formData, key)) : null);

/** เพิ่มหรือแก้ไขสถานที่ (ช่อง id ว่าง = เพิ่มใหม่) สิทธิ์และกติกาตรวจในฐานข้อมูล (RLS และ trigger places_rules) */
export async function savePlace(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const type = text(formData, "place_type");
  if (!isPlaceType(type)) return { error: "ประเภทสถานที่ไม่ถูกต้อง" };
  const sect = text(formData, "sect");
  const latitude = text(formData, "latitude");
  const longitude = text(formData, "longitude");
  const email = text(formData, "email");
  const status = text(formData, "status") || "open";

  if (!text(formData, "code")) return { error: "กรุณากรอกรหัส" };
  if (!text(formData, "name")) return { error: "กรุณากรอกชื่อ" };
  if (needsParentTemple(type) && !isUuid(text(formData, "parent_place_id"))) return { error: "กรุณาเลือกวัดที่ตั้ง" };
  if (sect && !(SECTS as readonly string[]).includes(sect)) return { error: "นิกายไม่ถูกต้อง" };
  if (type === "temple" && !sect) return { error: "กรุณาเลือกนิกาย" };
  if (code(formData, "province_code") === null || code(formData, "district_code") === null) {
    return { error: "กรุณาเลือกจังหวัดและอำเภอ" };
  }
  if (text(formData, "postal_code") && !/^\d{5}$/.test(text(formData, "postal_code"))) {
    return { error: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก" };
  }
  if (!isUuid(text(formData, "org_unit_id"))) return { error: "กรุณาเลือกเขตปกครองคณะสงฆ์ที่สังกัด" };
  if (Boolean(latitude) !== Boolean(longitude)) return { error: "พิกัดต้องกรอกทั้งละติจูดและลองจิจูด" };
  if (latitude && (!Number.isFinite(Number(latitude)) || Math.abs(Number(latitude)) > 90)) {
    return { error: "ละติจูดต้องเป็นตัวเลขระหว่าง -90 ถึง 90" };
  }
  if (longitude && (!Number.isFinite(Number(longitude)) || Math.abs(Number(longitude)) > 180)) {
    return { error: "ลองจิจูดต้องเป็นตัวเลขระหว่าง -180 ถึง 180" };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (!(PLACE_STATUSES as readonly string[]).includes(status)) return { error: "สถานะไม่ถูกต้อง" };
  if (text(formData, "established_on_incomplete")) return { error: "วันที่จัดตั้งยังกรอกไม่ครบหรือไม่ใช่วันที่ที่มีจริง" };

  const row = {
    code: text(formData, "code"),
    name: text(formData, "name"),
    sect: sect || null,
    house_no: text(formData, "house_no"),
    road: text(formData, "road"),
    subdistrict_code: code(formData, "subdistrict_code"),
    district_code: code(formData, "district_code"),
    province_code: code(formData, "province_code"),
    postal_code: text(formData, "postal_code"),
    org_unit_id: text(formData, "org_unit_id"),
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
    office_phone: text(formData, "office_phone"),
    email,
    responsible_person_id: isUuid(text(formData, "responsible_person_id")) ? text(formData, "responsible_person_id") : null,
    status,
    established_on: text(formData, "established_on") || null,
    parent_place_id: needsParentTemple(type) ? text(formData, "parent_place_id") : null,
    note: text(formData, "note"),
  };

  const supabase = await createClient();
  let savedId = id;
  if (id) {
    if (!isUuid(id)) return { error: "ไม่พบสถานที่นี้" };
    const { data, error } = await supabase.from("places").update(row).eq("id", id).select("id");
    if (error) return { error: explainPlaceError(error) };
    if (!data?.length) return { error: "ท่านไม่มีสิทธิ์แก้ไขสถานที่นี้" };
  } else {
    const { data, error } = await supabase.from("places").insert({ ...row, place_type: type }).select("id").single();
    if (error) return { error: explainPlaceError(error) };
    savedId = (data as { id: string }).id;
  }

  revalidatePath(LIST);
  revalidateTag(REGISTRY_TAG, { expire: 0 }); // ล้างแคชของหน้าทะเบียนสาธารณะ ให้เห็นค่าใหม่ทันที
  revalidatePath(`${LIST}/${savedId}`);
  redirect(`${LIST}/${savedId}?saved=1`);
}

function explainPlaceError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "รหัสนี้มีในทะเบียนสถานที่แล้ว กรุณาใช้รหัสอื่น";
  if (error.code === "42501") return "ท่านไม่มีสิทธิ์บันทึกสถานที่ในเขตปกครองนี้";
  return explainError(error);
}

/** ปิดหรือเปิดใช้งานสถานที่ (ไม่ลบข้อมูลจริง) */
export async function setPlaceActive(id: string, active: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "ไม่พบสถานที่นี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("places").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainPlaceError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขสถานที่นี้" };
  revalidatePath(LIST);
  revalidateTag(REGISTRY_TAG, { expire: 0 }); // ล้างแคชของหน้าทะเบียนสาธารณะ ให้เห็นค่าใหม่ทันที
  revalidatePath(`${LIST}/${id}`);
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว" };
}

// ------------------------------------------------------------------
// ตัวช่วยของฟอร์ม: ค้นวัดที่ตั้ง และค้นผู้รับผิดชอบ (ทำงานในนามผู้ใช้ อยู่ใต้ RLS)
// ------------------------------------------------------------------

export type TemplePick = {
  sect: Sect | null;
  org_unit_id: string;
  house_no: string;
  road: string;
  province_code: number | null;
  district_code: number | null;
  subdistrict_code: number | null;
  postal_code: string;
  districts: CivilOption[];
  subdistricts: CivilOption[];
};

const clean = (q: string) => q.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

export async function searchTemples(q: string): Promise<PickerItem<TemplePick>[]> {
  const term = clean(q);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select(
      "id, code, name, sect, org_unit_id, house_no, road, province_code, district_code, subdistrict_code, postal_code, org_units(name), civil_districts(name, prefix), civil_provinces(name)",
    )
    .eq("place_type", "temple")
    .eq("is_active", true)
    .or(`name.ilike.%${term}%,code.ilike.%${term}%`)
    .order("name")
    .limit(20);
  type Row = Omit<TemplePick, "districts" | "subdistricts"> & {
    id: string;
    code: string;
    name: string;
    org_units: { name: string } | null;
    civil_districts: { name: string; prefix: string } | null;
    civil_provinces: { name: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? []).map(({ id, code: c, name, org_units, civil_districts, civil_provinces, ...rest }) => ({
    id,
    label: name,
    detail: [
      `รหัส ${c}`,
      rest.sect ? SECT_LABEL[rest.sect] : "",
      civil_districts ? `${civil_districts.prefix}${civil_districts.name}` : "",
      civil_provinces?.name ?? "",
      org_units?.name ?? "",
    ]
      .filter(Boolean)
      .join(" · "),
    data: { ...rest, districts: [], subdistricts: [] },
  }));
}

export async function searchResponsiblePersons(q: string): Promise<PickerItem[]> {
  const term = clean(q);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("lookup_personnel", { p_q: term, p_limit: 20, p_offset: 0 });
  type Row = { id: string; title: string; first_name: string; monastic_name: string; last_name: string; temple_name: string; org_unit_name: string };
  return ((data as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    label: personName(p),
    detail: [p.temple_name, p.org_unit_name].filter(Boolean).join(" · "),
  }));
}

// ------------------------------------------------------------------
// นำเข้าจาก Excel ทีละประเภท
// ------------------------------------------------------------------

async function checkRows(type: PlaceType, raw: PlaceImportRaw[]): Promise<PlaceImportRow[]> {
  const rows = validatePlaceImportRows(type, raw);
  const candidates = rows.filter((r) => r.status === "new" && r.data);
  if (candidates.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_places_import", {
      p_type: type,
      p_rows: candidates.map((r) => r.data),
    });
    if (error) throw error;
    const results = new Map(
      ((data as { row_number: number; status: PlaceImportRow["status"]; message: string }[] | null) ?? []).map((d) => [
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

export async function previewPlaceImport(
  type: PlaceType,
  formData: FormData,
): Promise<ImportPreviewResult<PlaceImportRaw[]>> {
  try {
    if (!isPlaceType(type)) return { ok: false, error: "ประเภทสถานที่ไม่ถูกต้อง" };
    const sheet = await readUploadedSheet(formData, placeImportHeaders(type), PLACE_IMPORT_MAX_ROWS);
    if (!sheet.ok) return sheet;
    const rows = await checkRows(type, sheet.rows);
    return {
      ok: true,
      rows: rows.map(({ rowNumber, cells, status, message }) => ({ rowNumber, cells, status, message })),
      payload: sheet.rows,
    };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

export async function confirmPlaceImport(type: PlaceType, raw: PlaceImportRaw[]): Promise<ActionResult> {
  try {
    if (!isPlaceType(type)) return { ok: false, error: "ประเภทสถานที่ไม่ถูกต้อง" };
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > PLACE_IMPORT_MAX_ROWS) {
      return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
    }
    // ตรวจซ้ำฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อผลตรวจที่ส่งมาจากหน้าจอ
    const rows = await checkRows(
      type,
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
    const { data, error } = await supabase.rpc("import_places", { p_type: type, p_rows: fresh.map((r) => r.data) });
    if (error) return { ok: false, error: explainError(error) };
    revalidatePath(LIST);
    revalidateTag(REGISTRY_TAG, { expire: 0 }); // ล้างแคชของหน้าทะเบียนสาธารณะ ให้เห็นค่าใหม่ทันที
    return { ok: true, message: `นำเข้าแล้ว ${Number(data).toLocaleString("th-TH")} รายการ` };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

/** ตัวเลือกอำเภอและตำบลของวัดที่เลือก (ใช้เติมที่ตั้งของสำนักให้ตรงกับวัด) */
export async function loadTempleAreas(districtCode: number | null, provinceCode: number | null) {
  const supabase = await createClient();
  const [districts, subdistricts] = await Promise.all([
    provinceCode === null
      ? { data: [] }
      : supabase.from("civil_districts").select("code, name, prefix").eq("province_code", provinceCode).order("name"),
    districtCode === null
      ? { data: [] }
      : supabase
          .from("civil_subdistricts")
          .select("code, name, prefix, postal_code")
          .eq("district_code", districtCode)
          .order("name"),
  ]);
  return {
    districts: (districts.data as CivilOption[] | null) ?? [],
    subdistricts: (subdistricts.data as CivilOption[] | null) ?? [],
  };
}
