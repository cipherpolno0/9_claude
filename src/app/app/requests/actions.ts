"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import type { PickerItem } from "@/components/search-picker";
import { explainError } from "@/lib/errors";
import { isPlaceRequestType, isSamnakType, SAMNAK_TYPE_LABEL } from "@/lib/place-requests";
import { createClient } from "@/lib/supabase/server";
import { TRACK_TAG } from "@/lib/track";
import { VENUE_TYPE_LABEL, isVenueType, type VenueType } from "@/lib/venues";

const LIST = "/app/requests";
const UUID = /^[0-9a-f-]{36}$/i;

export type PlaceRequestInput = Record<string, unknown>;
type SubmitResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * ยื่นคำขอจัดตั้งหรือขอยุบ ผ่าน submit_place_request (ฐานข้อมูลตรวจสิทธิ์และข้อมูลทั้งหมด)
 * คืนรหัสคำขอ เพื่อให้หน้าจอแนบเอกสารทีละไฟล์ต่อ
 */
export async function submitPlaceRequest(type: string, data: PlaceRequestInput): Promise<SubmitResult> {
  if (!isPlaceRequestType(type)) return { ok: false, error: "ไม่พบชนิดคำขอนี้" };
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("submit_place_request", { p_type: type, p_data: data });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath(LIST);
  revalidatePath("/app");
  revalidatePath("/app/approvals");
  revalidateTag(TRACK_TAG, { expire: 0 });
  revalidatePath("/track");
  return { ok: true, id: id as string };
}

/** ผู้ยื่นแก้ไขคำขอที่ถูกส่งกลับ แล้วส่งใหม่ */
export async function resubmitPlaceRequest(requestId: string, data: PlaceRequestInput): Promise<SubmitResult> {
  if (!UUID.test(requestId)) return { ok: false, error: "ไม่พบคำขอนี้" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_place_request", { p_request_id: requestId, p_data: data });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath(LIST);
  revalidatePath("/app");
  revalidatePath("/app/approvals");
  revalidateTag(TRACK_TAG, { expire: 0 });
  revalidatePath("/track");
  revalidatePath(`/app/approvals/${requestId}`);
  return { ok: true, id: requestId };
}

const clean = (q: string) => q.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

/** ค้นสำนักเรียนและสำนักศาสนศึกษาที่ยังไม่ถูกยุบ สำหรับฟอร์มขอยุบ (เห็นเฉพาะสำนักที่ผู้ใช้ดูได้ ฐานข้อมูลตรวจสิทธิ์ยื่นอีกชั้น) */
export async function searchSamnak(q: string): Promise<PickerItem[]> {
  const term = clean(q);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("id, code, name, place_type, status, parent:parent_place_id(name), org_units(name)")
    .in("place_type", ["samnak_rian", "samnak_sasanasuksa"])
    .eq("is_active", true)
    .neq("status", "dissolved")
    .or(`name.ilike.%${term}%,code.ilike.%${term}%`)
    .order("name")
    .limit(20);
  type Row = {
    id: string;
    code: string;
    name: string;
    place_type: string;
    parent: { name: string } | null;
    org_units: { name: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    detail: [
      isSamnakType(p.place_type) ? SAMNAK_TYPE_LABEL[p.place_type] : "",
      `รหัส ${p.code}`,
      p.parent?.name ?? "",
      p.org_units?.name ?? "",
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

export type VenuePick = { venue_type: VenueType; place_name: string };

/**
 * ค้นสนามสอบที่เปิดอยู่ สำหรับฟอร์มขอปิด ขอย้าย และช่อง สนามสอบที่จะรับผู้เข้าสอบแทน
 * type = จำกัดประเภท (นักธรรม / ธรรมศึกษา)  excludeId = ไม่รวมสนามสอบนี้ (เห็นเฉพาะสนามที่ผู้ใช้ดูได้ ฐานข้อมูลตรวจสิทธิ์ยื่นอีกชั้น)
 */
export async function searchOpenVenues(q: string, type?: string, excludeId?: string): Promise<PickerItem<VenuePick>[]> {
  const term = clean(q);
  if (term.length < 2) return [];
  const supabase = await createClient();
  let query = supabase
    .from("exam_venues")
    .select("id, code, name, venue_type, places(name), org_units(name)")
    .eq("is_active", true)
    .eq("status", "open")
    .or(`name.ilike.%${term}%,code.ilike.%${term}%`)
    .order("name")
    .limit(20);
  if (isVenueType(type)) query = query.eq("venue_type", type);
  if (excludeId && UUID.test(excludeId)) query = query.neq("id", excludeId);
  const { data } = await query;
  type Row = {
    id: string;
    code: string;
    name: string;
    venue_type: VenueType;
    places: { name: string } | null;
    org_units: { name: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? []).map((v) => ({
    id: v.id,
    label: v.name,
    detail: [VENUE_TYPE_LABEL[v.venue_type], `รหัส ${v.code}`, v.places?.name ?? "", v.org_units?.name ?? ""]
      .filter(Boolean)
      .join(" · "),
    data: { venue_type: v.venue_type, place_name: v.places?.name ?? "" },
  }));
}
