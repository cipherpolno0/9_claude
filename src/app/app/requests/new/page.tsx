import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import type { PickerItem } from "@/components/search-picker";
import { DEFAULT_STEP_DAYS, SAMNAK_TYPE_LABEL, isSamnakType, type PlaceRequestType } from "@/lib/place-requests";
import { fetchDocumentTypes } from "@/lib/place-requests-server";
import { createClient } from "@/lib/supabase/server";

import { PlaceRequestForm } from "../place-request-form";

export const metadata: Metadata = { title: "ยื่นคำขอจัดตั้งหรือขอยุบสำนัก" };
export const dynamic = "force-dynamic";

export default async function NewPlaceRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/requests");
  // ยื่นได้เฉพาะผู้มีสิทธิ์แก้ไขทะเบียนสถานที่ (ฐานข้อมูลตรวจซ้ำตามเขตของวัดหรือสำนัก)
  if (!ctx.canEditPlaces) redirect("/app/requests");
  const query = await searchParams;
  const raw = query.type;
  const type: PlaceRequestType = (Array.isArray(raw) ? raw[0] : raw) === "dissolve" ? "samnak_dissolve" : "samnak_establish";
  const docTypes = await fetchDocumentTypes(type, true);

  // เปิดจากหน้าทะเบียนสถานที่ (?place=) ให้เลือกสำนักนั้นไว้ให้ (อ่านในนามผู้ใช้ เห็นเฉพาะสำนักที่มีสิทธิ์ดู)
  let place: PickerItem | null = null;
  const placeParam = Array.isArray(query.place) ? query.place[0] : query.place;
  if (type === "samnak_dissolve" && placeParam && /^[0-9a-f-]{36}$/i.test(placeParam)) {
    const supabase = await createClient();
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
      place = {
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
  const days = ctx.settings.place_request_step_days ?? DEFAULT_STEP_DAYS;
  const establish = type === "samnak_establish";

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/requests" className="text-primary underline underline-offset-4">
          ← คำขอ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">
        {establish ? "ยื่นคำขอจัดตั้งสำนักเรียน สำนักศาสนศึกษา" : "ยื่นคำขอยุบสำนักเรียน สำนักศาสนศึกษา"}
      </h1>
      <p className="mt-1 text-muted-foreground">
        {establish
          ? "เมื่อส่วนกลางอนุมัติเป็นขั้นสุดท้าย ระบบจะเพิ่มสำนักนี้ในทะเบียนสถานที่ สถานะ เปิดดำเนินการ ให้เอง"
          : "เมื่อส่วนกลางอนุมัติเป็นขั้นสุดท้าย ระบบจะเปลี่ยนสถานะของสำนักเป็น ยุบ และแจ้งเตือนผู้เกี่ยวข้องให้เอง"}{" "}
        คำขอผ่านการพิจารณาตามลำดับ ตำบล อำเภอ จังหวัด ภาค ส่วนกลาง ชั้นละไม่เกิน {days} วัน
      </p>
      <div className="mt-6">
        <PlaceRequestForm key={type} type={type} docTypes={docTypes} initial={{ place }} />
      </div>
    </section>
  );
}
