"use server";

import type { PickerItem } from "@/components/search-picker";
import { regionNoFromName } from "@/lib/exam-forms";
import { fetchFormTemplate, fetchTemplateContext } from "@/lib/exam-forms-server";
import { PLACE_TYPE_LABEL, isPlaceType } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

type PlaceRow = {
  id: string;
  code: string;
  name: string;
  place_type: string;
  temple_name: string | null;
  org_unit_name: string;
  district_name: string | null;
  province_name: string | null;
};

/** สำนักหรือสถานศึกษาในเขตของผู้ใช้ ตามประเภทการสอบของรอบ (ฐานข้อมูลกรองด้วย can_access) */
export async function searchRegisterPlaces(roundId: string, q: string): Promise<PickerItem[]> {
  if (!UUID.test(roundId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("exam_register_places", { p_round: roundId, p_q: q.trim().slice(0, 100), p_limit: 20 });
  return ((data as PlaceRow[] | null) ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    detail: [
      isPlaceType(p.place_type) ? PLACE_TYPE_LABEL[p.place_type] : p.place_type,
      p.code,
      p.temple_name ? `วัดที่ตั้ง ${p.temple_name}` : null,
      [p.district_name, p.province_name].filter(Boolean).join(" "),
      p.org_unit_name,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

type VenueRow = { id: string; code: string; name: string; place_name: string; org_unit_name: string; district_name: string | null; province_name: string | null };

/** สนามสอบที่เปิดอยู่ ประเภทเดียวกับรอบ และเปิดสอบชั้นของรอบ */
export async function searchRegisterVenues(roundId: string, q: string): Promise<PickerItem[]> {
  if (!UUID.test(roundId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("exam_register_venues", { p_round: roundId, p_q: q.trim().slice(0, 100), p_limit: 20 });
  return ((data as VenueRow[] | null) ?? []).map((v) => ({
    id: v.id,
    label: v.name,
    detail: [`รหัส ${v.code}`, `ตั้งอยู่ที่ ${v.place_name}`, [v.district_name, v.province_name].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(" · "),
  }));
}

export type TemplateCheck =
  | { ok: true; fileHint: string; warnings: string[] }
  | { ok: false; error: string };

/** ตรวจก่อนดาวน์โหลด: บอกสิ่งที่ระบบเติมให้ไม่ได้ (ผู้กรอกต้องเติมเอง) */
export async function checkRegisterTemplate(roundId: string, placeId: string, venueId: string): Promise<TemplateCheck> {
  if (![roundId, placeId, venueId].every((v) => UUID.test(v))) return { ok: false, error: "กรุณาเลือกให้ครบทั้ง 3 ขั้น" };
  const result = await fetchTemplateContext(roundId, placeId, venueId);
  if (!result.ok) return result;
  const { context } = result;
  const template = await fetchFormTemplate(context.template_id);
  if (!template) return { ok: false, error: "ไม่พบแบบฟอร์มบัญชี ศ. ของรอบนี้" };
  const codeCell = template.header_cells.find((h) => h.field === "venue_code");
  const warnings: string[] = [];
  const code = context.venue.code.trim();
  const codeOk =
    /^\d+$/.test(code) &&
    (codeCell?.min === undefined || Number(code) >= codeCell.min) &&
    (codeCell?.max === undefined || Number(code) <= codeCell.max);
  if (!codeOk) warnings.push(`รหัสสนามสอบในทะเบียน (${code}) ไม่ใช่ตัวเลขตามแบบ ระบบจะเว้นช่องรหัสสนามสอบไว้ให้กรอกเอง`);
  if (regionNoFromName(context.venue.region_name) === null) {
    warnings.push("หาเลขภาคของสนามสอบจากเขตปกครองไม่ได้ ระบบจะเว้นช่องภาคไว้ให้กรอกเอง");
  }
  if (!context.venue.province) warnings.push("สถานที่ตั้งของสนามสอบยังไม่มีตำบล อำเภอ จังหวัด ในทะเบียน ระบบจะเว้นไว้ให้กรอกเอง");
  return { ok: true, fileHint: `${template.code} สำหรับ ${context.place.name}`, warnings };
}
