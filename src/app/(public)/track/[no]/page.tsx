import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RequestTimeline } from "@/components/request-timeline";
import { LEVEL_LABEL } from "@/lib/org-units";
import { PLACE_REQUEST_LABEL, isPlaceRequestType, requestKindLabel } from "@/lib/place-requests";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/labels";
import { thaiDate } from "@/lib/thai";
import { fetchPublicRequestStatus } from "@/lib/track-server";

export const metadata: Metadata = { title: "สถานะคำขอ" };

/** เส้นเวลาของคำขอ 1 รายการ สำหรับผู้ไม่ล็อกอิน: ไม่มีชื่อบุคคล ความเห็น เหตุผล และเอกสารแนบ */
export default async function TrackRequestPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const request = await fetchPublicRequestStatus(decodeURIComponent(no));
  if (!request) notFound();

  const typeText = isPlaceRequestType(request.type_key)
    ? `${PLACE_REQUEST_LABEL[request.type_key]}${requestKindLabel(request.kind)}`
    : request.type_name;
  const current = request.steps.find((s) => s.step_no === request.current_step);
  const facts: [string, string][] = [
    ["เลขที่คำขอ", request.request_no],
    ["ชนิดคำขอ", typeText],
  ];
  if (request.subject_name) facts.push(["ชื่อสำนักหรือสนามสอบ", request.subject_name]);
  if (request.place_name) facts.push([request.to_place_name ? "สถานที่ตั้งเดิม" : "สถานที่ตั้ง", request.place_name]);
  if (request.to_place_name) facts.push(["สถานที่ตั้งใหม่", request.to_place_name]);
  if (request.province_name) facts.push(["จังหวัด", request.province_name]);
  if (request.region_name) facts.push(["ภาค", request.region_name]);
  facts.push(
    ["วันที่ยื่น", thaiDate(request.submitted_at)],
    [
      "ขั้นที่อยู่ปัจจุบัน",
      request.status === "pending" && current
        ? `ขั้นที่ ${current.step_no} จาก ${request.steps.length} · ${LEVEL_LABEL[current.level]} · ${current.unit_name}`
        : request.status === "returned" && current
          ? `ส่งกลับให้ผู้ยื่นแก้ไข (จากขั้นที่ ${current.step_no})`
          : "สิ้นสุดการพิจารณาแล้ว",
    ],
    [
      "ผลการพิจารณา",
      `${REQUEST_STATUS_LABEL[request.status]}${request.decided_at ? ` เมื่อ ${thaiDate(request.decided_at)}` : ""}`,
    ],
  );

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/track" className="text-primary underline underline-offset-4">
          ← ติดตามคำขอ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{request.subject_name ?? request.request_no}</h1>
      <p className="mt-1 text-muted-foreground">
        {typeText} · เลขที่ {request.request_no}
      </p>

      <dl className="mt-6 rounded-xl border bg-card px-5 py-2" data-testid="track-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[12rem_1fr]">
            <dt className="font-semibold">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">เส้นเวลาการพิจารณา</h2>
        <div className="mt-3">
          <RequestTimeline data={request} />
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        หน้านี้แสดงเฉพาะสถานะ ไม่แสดงความเห็นของผู้พิจารณา เหตุผลในคำขอ และเอกสารแนบ ผู้ยื่นดูรายละเอียดได้เมื่อเข้าสู่ระบบ
      </p>
    </section>
  );
}
