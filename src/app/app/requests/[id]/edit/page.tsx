import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import {
  SAMNAK_TYPE_LABEL,
  isPlaceRequestType,
  isVenueRequestType,
  readPlaceRequestPayload,
  readVenueRequestPayload,
  type PlaceRequestType,
} from "@/lib/place-requests";
import { fetchRequestDetail } from "@/lib/requests/queries";
import { VENUE_TYPE_LABEL } from "@/lib/venues";
import { fetchAcademicYears } from "@/lib/venues-server";

import { PlaceRequestForm, type PlaceRequestInitial } from "../../place-request-form";

export const metadata: Metadata = { title: "แก้ไขคำขอแล้วส่งใหม่" };
export const dynamic = "force-dynamic";

/** ค่าเริ่มต้นของฟอร์มจากข้อมูลคำขอเดิม */
function initialOf(type: PlaceRequestType, payload: Record<string, unknown>): PlaceRequestInitial {
  if (isVenueRequestType(type)) {
    const v = readVenueRequestPayload(payload);
    const typeLabel = v.venueType ? VENUE_TYPE_LABEL[v.venueType] : "";
    if (type === "venue_open") {
      return {
        venue: {
          name: v.name,
          venueType: v.venueType,
          place: { id: v.placeId, label: v.placeName, detail: v.unitName },
          levels: v.levels,
          capacity: v.capacity,
          chair: v.chairPersonId ? { id: v.chairPersonId, label: v.chairName } : null,
          receiver: v.receiverPersonId ? { id: v.receiverPersonId, label: v.receiverName } : null,
          year: v.startYear,
          detail: v.detail,
        },
      };
    }
    return {
      venue: {
        venue: {
          id: v.venueId,
          label: v.name,
          detail: [typeLabel, `รหัส ${v.venueCode}`, v.placeName, v.unitName].filter(Boolean).join(" · "),
          data: v.venueType ? { venue_type: v.venueType, place_name: v.placeName } : undefined,
        },
        replacement: v.replacementVenueId
          ? { id: v.replacementVenueId, label: v.replacementName, detail: `รหัส ${v.replacementCode}` }
          : null,
        toPlace: v.toPlaceId ? { id: v.toPlaceId, label: v.toPlaceName } : null,
        year: v.effectiveYear,
        detail: v.detail,
      },
    };
  }
  const p = readPlaceRequestPayload(payload);
  const typeLabel = p.placeType ? SAMNAK_TYPE_LABEL[p.placeType] : "";
  return type === "samnak_establish"
    ? {
        name: p.name,
        placeType: p.placeType,
        temple: { id: p.templeId, label: p.templeName, detail: p.unitName },
        head: p.headPersonId ? { id: p.headPersonId, label: p.headName } : null,
        counts: p.counts,
        buildings: p.buildings,
        detail: p.detail,
      }
    : {
        place: { id: p.placeId, label: p.name, detail: [typeLabel, p.templeName, p.unitName].filter(Boolean).join(" · ") },
        detail: p.detail,
        supportPlan: p.supportPlan,
      };
}

export default async function EditPlaceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMenu("/app/requests");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const request = await fetchRequestDetail(id);
  if (!request || !isPlaceRequestType(request.type_key)) notFound();
  // แก้ไขได้เฉพาะผู้ยื่น และเฉพาะคำขอที่ถูกส่งกลับแก้ไข
  if (request.requester_id !== ctx.user.id || request.status !== "returned") redirect(`/app/approvals/${id}`);
  const years = isVenueRequestType(request.type_key) ? await fetchAcademicYears() : [];

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/approvals/${id}`} className="text-primary underline underline-offset-4">
          ← กลับไปหน้าคำขอ {request.request_no}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">แก้ไขคำขอแล้วส่งใหม่</h1>
      <p className="mt-1 text-muted-foreground">
        เลขที่ {request.request_no} · เมื่อส่งใหม่ คำขอจะกลับไปรอพิจารณาที่ขั้นที่ส่งกลับมา (ขั้นที่ {request.current_step})
      </p>
      <div className="mt-6">
        <PlaceRequestForm
          type={request.type_key}
          docTypes={[]}
          requestId={id}
          initial={initialOf(request.type_key, request.payload)}
          years={years.map((y) => ({ year_be: y.year_be, is_current: y.is_current, request_deadline: y.request_deadline }))}
        />
      </div>
    </section>
  );
}
