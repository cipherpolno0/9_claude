import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import type { PickerItem } from "@/components/search-picker";
import { requireMenu } from "@/lib/auth/guards";
import {
  DEFAULT_STEP_DAYS,
  PLACE_REQUEST_TITLE,
  PLACE_REQUEST_TYPES,
  REQUEST_TYPE_PARAM,
  SAMNAK_TYPE_LABEL,
  isSamnakType,
  isVenueRequestType,
  requestTypeFromParam,
  type PlaceRequestType,
} from "@/lib/place-requests";
import { fetchDocumentTypes } from "@/lib/place-requests-server";
import { createClient } from "@/lib/supabase/server";
import { VENUE_TYPE_LABEL, type VenueType } from "@/lib/venues";
import { fetchAcademicYears } from "@/lib/venues-server";

import type { VenuePick } from "../actions";
import { PlaceRequestForm, type PlaceRequestInitial } from "../place-request-form";

export const metadata: Metadata = { title: "ยื่นคำขอ" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

const INTRO: Record<PlaceRequestType, string> = {
  samnak_establish: "เมื่อส่วนกลางอนุมัติเป็นขั้นสุดท้าย ระบบจะเพิ่มสำนักนี้ในทะเบียนสถานที่ สถานะ เปิดดำเนินการ ให้เอง",
  samnak_dissolve: "เมื่อส่วนกลางอนุมัติเป็นขั้นสุดท้าย ระบบจะเปลี่ยนสถานะของสำนักเป็น ยุบ และแจ้งเตือนผู้เกี่ยวข้องให้เอง",
  venue_open:
    "เมื่อส่วนกลางอนุมัติเป็นขั้นสุดท้าย ระบบจะเพิ่มสนามสอบในทะเบียนสนามสอบ พร้อมประธานสนามสอบและผู้รับข้อสอบของปีการศึกษาที่เริ่ม ให้เอง",
  venue_close:
    "เมื่อส่วนกลางอนุมัติเป็นขั้นสุดท้าย ระบบจะเปลี่ยนสถานะของสนามสอบเป็น ปิด นำรายชื่อประธานและผู้รับข้อสอบของปีปัจจุบันเป็นต้นไปออก และบันทึกสนามสอบที่รับผู้เข้าสอบแทน ให้เอง",
  venue_move:
    "เมื่อส่วนกลางอนุมัติเป็นขั้นสุดท้าย ระบบจะเปลี่ยนสถานที่ตั้งของสนามสอบให้ทันที และเก็บสถานที่ตั้งเดิมไว้ในประวัติของสนามสอบ",
};

const DESCRIPTION: Record<PlaceRequestType, string> = {
  samnak_establish: "ขอจัดตั้งสำนักใหม่ที่วัดในทะเบียนสถานที่",
  samnak_dissolve: "ขอยุบสำนักที่มีอยู่ในทะเบียนสถานที่",
  venue_open: "ขอเปิดสนามสอบนักธรรมหรือธรรมศึกษาแห่งใหม่",
  venue_close: "ขอปิดสนามสอบ และระบุสนามสอบที่จะรับผู้เข้าสอบแทน",
  venue_move: "ขอย้ายสนามสอบไปตั้งที่สถานที่ใหม่",
};

export default async function NewPlaceRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/requests");
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // ยื่นได้เฉพาะผู้มีสิทธิ์แก้ไขทะเบียนของเรื่องนั้น (ฐานข้อมูลตรวจซ้ำตามเขตของวัด สำนัก หรือสนามสอบ)
  const allowed = PLACE_REQUEST_TYPES.filter((t) => (isVenueRequestType(t) ? ctx.canEditVenues : ctx.canEditPlaces));
  if (allowed.length === 0) redirect("/app/requests");
  const type = requestTypeFromParam(one(query.type));

  // ยังไม่ได้เลือกชนิดคำขอ: แสดงรายการให้เลือก
  if (!type) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
        <p>
          <Link href="/app/requests" className="text-primary underline underline-offset-4">
            ← คำขอ
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ยื่นคำขอ</h1>
        <p className="mt-1 text-muted-foreground">เลือกชนิดคำขอที่จะยื่น</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="request-type-list">
          {allowed.map((t) => (
            <li key={t}>
              <Link
                href={`/app/requests/new?type=${REQUEST_TYPE_PARAM[t]}`}
                className="block h-full rounded-xl border bg-card p-4 hover:bg-secondary"
              >
                <span className="block text-lg font-bold text-primary">{PLACE_REQUEST_TITLE[t]}</span>
                <span className="block text-muted-foreground">{DESCRIPTION[t]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (!allowed.includes(type)) redirect("/app/requests");

  const venueRequest = isVenueRequestType(type);
  const [docTypes, years] = await Promise.all([
    fetchDocumentTypes(type, true),
    venueRequest ? fetchAcademicYears() : Promise.resolve([]),
  ]);
  const supabase = await createClient();
  const initial: PlaceRequestInitial = {};

  // เปิดจากหน้าทะเบียนสถานที่ (?place=) ให้เลือกสำนักนั้นไว้ให้ (อ่านในนามผู้ใช้ เห็นเฉพาะสำนักที่มีสิทธิ์ดู)
  const placeParam = one(query.place);
  if (type === "samnak_dissolve" && placeParam && UUID.test(placeParam)) {
    const { data } = await supabase
      .from("places")
      .select("id, code, name, place_type, parent:parent_place_id(name), org_units(name)")
      .eq("id", placeParam)
      .in("place_type", ["samnak_rian", "samnak_sasanasuksa"])
      .eq("is_active", true)
      .neq("status", "dissolved")
      .maybeSingle();
    const row = data as unknown as {
      id: string;
      code: string;
      name: string;
      place_type: string;
      parent: { name: string } | null;
      org_units: { name: string } | null;
    } | null;
    if (row) {
      initial.place = {
        id: row.id,
        label: row.name,
        detail: [
          isSamnakType(row.place_type) ? SAMNAK_TYPE_LABEL[row.place_type] : "",
          `รหัส ${row.code}`,
          row.parent?.name ?? "",
          row.org_units?.name ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
  }

  // เปิดจากหน้าสนามสอบ (?venue=) ให้เลือกสนามสอบนั้นไว้ให้
  const venueParam = one(query.venue);
  if ((type === "venue_close" || type === "venue_move") && venueParam && UUID.test(venueParam)) {
    const { data } = await supabase
      .from("exam_venues")
      .select("id, code, name, venue_type, places(name), org_units(name)")
      .eq("id", venueParam)
      .eq("is_active", true)
      .eq("status", "open")
      .maybeSingle();
    const row = data as unknown as {
      id: string;
      code: string;
      name: string;
      venue_type: VenueType;
      places: { name: string } | null;
      org_units: { name: string } | null;
    } | null;
    if (row) {
      const venue: PickerItem<VenuePick> = {
        id: row.id,
        label: row.name,
        detail: [VENUE_TYPE_LABEL[row.venue_type], `รหัส ${row.code}`, row.places?.name ?? "", row.org_units?.name ?? ""]
          .filter(Boolean)
          .join(" · "),
        data: { venue_type: row.venue_type, place_name: row.places?.name ?? "" },
      };
      initial.venue = { venue };
    }
  }

  const days = ctx.settings.place_request_step_days ?? DEFAULT_STEP_DAYS;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/requests" className="text-primary underline underline-offset-4">
          ← คำขอ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ยื่นคำ{PLACE_REQUEST_TITLE[type]}</h1>
      <p className="mt-1 text-muted-foreground">
        {INTRO[type]} คำขอผ่านการพิจารณาตามลำดับ ตำบล อำเภอ จังหวัด ภาค ส่วนกลาง ชั้นละไม่เกิน {days} วัน
      </p>
      <div className="mt-6">
        <PlaceRequestForm
          key={type}
          type={type}
          docTypes={docTypes}
          initial={initial}
          years={years.map((y) => ({ year_be: y.year_be, is_current: y.is_current, request_deadline: y.request_deadline }))}
        />
      </div>
    </section>
  );
}
