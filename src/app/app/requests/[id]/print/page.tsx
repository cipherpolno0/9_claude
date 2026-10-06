import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { listAttachments } from "@/lib/attachments/actions";
import { LEVEL_LABEL } from "@/lib/org-units";
import {
  DEPARTMENTS,
  PLACE_REQUEST_LABEL,
  SAMNAK_TYPE_LABEL,
  isPlaceRequestType,
  isVenueRequestType,
  readPlaceRequestPayload,
  readVenueRequestPayload,
} from "@/lib/place-requests";
import { fetchRequestDocuments } from "@/lib/place-requests-server";
import { REQUEST_STATUS_LABEL, STEP_STATUS_LABEL } from "@/lib/requests/labels";
import { fetchRequestDetail } from "@/lib/requests/queries";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { VENUE_TYPE_LABEL, venueLevelsText } from "@/lib/venues";

import { RequestPrintSheet, type RequestPrintData } from "./print-sheet";

export const metadata: Metadata = { title: "พิมพ์แบบคำขอ" };
export const dynamic = "force-dynamic";

export default async function PlaceRequestPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/requests");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // อ่านในนามผู้ใช้: ถ้า RLS ไม่ให้เห็นคำขอนี้จะได้หน้าไม่พบ
  const request = await fetchRequestDetail(id);
  if (!request || !isPlaceRequestType(request.type_key)) notFound();

  const [documents, files] = await Promise.all([fetchRequestDocuments(id), listAttachments("requests", id)]);
  const venueRequest = isVenueRequestType(request.type_key) ? request.type_key : null;
  const p = readPlaceRequestPayload(request.payload);
  const v = readVenueRequestPayload(request.payload);
  const establish = request.type_key === "samnak_establish";
  const typeLabel = venueRequest ? (v.venueType ? VENUE_TYPE_LABEL[v.venueType] : "") : p.placeType ? SAMNAK_TYPE_LABEL[p.placeType] : "สำนัก";

  const facts: [string, string][] = [
    ["เลขที่คำขอ", request.request_no],
    ["วันที่ยื่น", thaiDate(request.submitted_at)],
    ["ผู้ยื่น", request.requester_name],
  ];
  let blocks: [string, string][];
  if (venueRequest === "venue_open") {
    facts.push(
      ["ชื่อสนามสอบที่ขอเปิด", v.name || "-"],
      ["ประเภท", typeLabel || "-"],
      ["สถานที่ตั้ง", v.placeName || "-"],
      ["เขตคณะสงฆ์", v.unitName || request.org_unit_name],
      ["ชั้นที่เปิดสอบ", venueLevelsText(v.levels) || "-"],
      ["จำนวนผู้เข้าสอบโดยประมาณ", v.capacity === null ? "-" : `${v.capacity.toLocaleString("en-US")} รูป/คน`],
      ["ปีการศึกษาที่เริ่ม", v.startYear === null ? "-" : String(v.startYear)],
      ["ประธานสนามสอบที่เสนอ", v.chairName || "-"],
      ["ผู้รับข้อสอบที่เสนอ", v.receiverName || "-"],
    );
    blocks = v.detail ? [["หมายเหตุ", v.detail]] : [];
  } else if (venueRequest === "venue_close") {
    facts.push(
      ["สนามสอบที่ขอปิด", v.name || "-"],
      ["ประเภท", typeLabel || "-"],
      ["สถานที่ตั้ง", v.placeName || "-"],
      ["เขตคณะสงฆ์", v.unitName || request.org_unit_name],
      ["สนามสอบที่จะรับผู้เข้าสอบแทน", v.replacementName || "-"],
    );
    blocks = [["เหตุผล", v.detail]];
  } else if (venueRequest === "venue_move") {
    facts.push(
      ["สนามสอบที่ขอย้าย", v.name || "-"],
      ["ประเภท", typeLabel || "-"],
      ["สถานที่ตั้งเดิม", v.placeName || "-"],
      ["สถานที่ตั้งใหม่", v.toPlaceName || "-"],
      ["เขตคณะสงฆ์", v.unitName || request.org_unit_name],
      ["ปีการศึกษาที่มีผล", v.effectiveYear === null ? "-" : String(v.effectiveYear)],
    );
    blocks = [["เหตุผล", v.detail]];
  } else {
    facts.push(
      [establish ? "ชื่อสำนักที่ขอจัดตั้ง" : "สำนักที่ขอยุบ", p.name || "-"],
      ["ประเภท", typeLabel],
      ["วัดที่ตั้ง", p.templeName || "-"],
      ["เขตคณะสงฆ์", p.unitName || request.org_unit_name],
    );
    if (establish) facts.push(["เจ้าสำนัก", p.headName || "-"]);
    if (p.placeCode) facts.push(["รหัสในทะเบียนสถานที่", p.placeCode]);
    blocks = establish
      ? [
          ["อาคารสถานที่", p.buildings],
          ["เหตุผล", p.detail],
        ]
      : [
          ["เหตุผล", p.detail],
          ["แผนรองรับนักเรียนและบุคลากร", p.supportPlan],
        ];
  }
  if (venueRequest && v.venueCode) facts.push(["รหัสในทะเบียนสนามสอบ", v.venueCode]);

  const data: RequestPrintData = {
    title: `แบบคำ${PLACE_REQUEST_LABEL[request.type_key]}${typeLabel}`,
    subtitle: `เลขที่ ${request.request_no}`,
    facts,
    counts: establish
      ? DEPARTMENTS.map((d) => ({ label: d.label, teachers: p.counts[d.key].teachers, students: p.counts[d.key].students }))
      : null,
    blocks,
    documents: documents.map((d) => ({ name: d.name, required: d.is_required, fileCount: d.file_count })),
    otherFileCount: files.filter((f) => !f.doc_type_id).length,
    steps: request.timeline.steps.map((s) => ({
      stepNo: s.step_no,
      unit: `${LEVEL_LABEL[s.level]} · ${s.unit_name}`,
      result: s.status === "waiting" ? "" : STEP_STATUS_LABEL[s.status],
      comment: s.comment ?? "",
      decider: s.decider_name ?? "",
      date: s.decided_at ? thaiDate(s.decided_at, "short") : "",
    })),
    statusLine: `สถานะคำขอ: ${REQUEST_STATUS_LABEL[request.status]}${request.decided_at ? ` เมื่อ ${thaiDate(request.decided_at)}` : ""}`,
    printedAt: thaiDateTime(new Date()),
  };

  return <RequestPrintSheet data={data} />;
}
