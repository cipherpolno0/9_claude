import Link from "next/link";

import { PLACE_REQUEST_LABEL, readVenueRequestPayload, type VenueRequestType } from "@/lib/place-requests";
import { VENUE_TYPE_LABEL, venueLevelsText } from "@/lib/venues";

/**
 * สรุปคำขอเปิด ปิด ย้ายสนามสอบ ในหน้ารายละเอียดคำขอ (เหตุผลแสดงแยกในหัวข้อ เหตุผล ของหน้ากลาง)
 * ชื่อประธานสนามสอบและผู้รับข้อสอบแสดงเฉพาะในพื้นที่ทำงาน ไม่ส่งไปหน้าสาธารณะ
 */
export function VenueRequestSummary({
  typeKey,
  payload,
  applied,
  canOpenVenue,
}: {
  typeKey: VenueRequestType;
  payload: Record<string, unknown>;
  /** อนุมัติขั้นสุดท้ายแล้ว */
  applied: boolean;
  /** ผู้ดูมีสิทธิ์เปิดทะเบียนสนามสอบ (แสดงลิงก์ไปยังสนามสอบ) */
  canOpenVenue: boolean;
}) {
  const v = readVenueRequestPayload(payload);
  const typeLabel = v.venueType ? VENUE_TYPE_LABEL[v.venueType] : "";
  const venueLink = (id: string, label: string) =>
    canOpenVenue && id ? (
      <Link href={`/app/places/venues/${id}`} className="text-primary underline underline-offset-4">
        {label}
      </Link>
    ) : (
      label
    );

  const rows: [string, React.ReactNode][] = [
    ["เรื่อง", `${PLACE_REQUEST_LABEL[typeKey]}${typeLabel}`],
    ["สนามสอบ", venueLink(v.venueId, v.name || "-")],
    ["ประเภท", typeLabel || "-"],
  ];
  if (typeKey === "venue_open") {
    rows.push(
      ["สถานที่ตั้ง", v.placeName || "-"],
      ["เขตคณะสงฆ์", v.unitName || "-"],
      ["ชั้นที่เปิดสอบ", venueLevelsText(v.levels) || "-"],
      ["จำนวนผู้เข้าสอบโดยประมาณ", v.capacity === null ? "-" : `${v.capacity.toLocaleString("th-TH")} รูป/คน`],
      ["ปีการศึกษาที่เริ่ม", v.startYear === null ? "-" : String(v.startYear)],
      ["ประธานสนามสอบที่เสนอ", v.chairName || "-"],
      ["ผู้รับข้อสอบที่เสนอ", v.receiverName || "-"],
    );
  } else if (typeKey === "venue_close") {
    rows.push(
      ["สถานที่ตั้ง", v.placeName || "-"],
      ["เขตคณะสงฆ์", v.unitName || "-"],
      ["สนามสอบที่จะรับผู้เข้าสอบแทน", venueLink(v.replacementVenueId, v.replacementName || "-")],
    );
  } else {
    rows.push(
      ["สถานที่ตั้งเดิม", v.placeName || "-"],
      ["สถานที่ตั้งใหม่", v.toPlaceName || "-"],
      ["เขตคณะสงฆ์", v.unitName || "-"],
      ["ปีการศึกษาที่มีผล", v.effectiveYear === null ? "-" : String(v.effectiveYear)],
    );
  }
  if (v.venueCode) rows.push(["รหัสในทะเบียนสนามสอบ", v.venueCode]);

  const note: Record<VenueRequestType, [string, string]> = {
    venue_open: [
      "ดำเนินการแล้ว: ระบบเพิ่มสนามสอบนี้ในทะเบียนสนามสอบ พร้อมประธานสนามสอบและผู้รับข้อสอบของปีการศึกษาที่เริ่ม",
      "เมื่อได้รับอนุมัติขั้นสุดท้าย ระบบจะเพิ่มสนามสอบนี้ในทะเบียนสนามสอบ พร้อมประธานสนามสอบและผู้รับข้อสอบของปีการศึกษาที่เริ่ม",
    ],
    venue_close: [
      "ดำเนินการแล้ว: ระบบเปลี่ยนสถานะของสนามสอบเป็น ปิด นำรายชื่อของปีปัจจุบันเป็นต้นไปออก และบันทึกสนามสอบที่รับผู้เข้าสอบแทนไว้ในประวัติ",
      "เมื่อได้รับอนุมัติขั้นสุดท้าย ระบบจะเปลี่ยนสถานะของสนามสอบเป็น ปิด นำรายชื่อประธานและผู้รับข้อสอบของปีปัจจุบันเป็นต้นไปออก และบันทึกสนามสอบที่รับผู้เข้าสอบแทน",
    ],
    venue_move: [
      "ดำเนินการแล้ว: ระบบเปลี่ยนสถานที่ตั้งของสนามสอบ และเก็บสถานที่ตั้งเดิมไว้ในประวัติของสนามสอบ",
      "เมื่อได้รับอนุมัติขั้นสุดท้าย ระบบจะเปลี่ยนสถานที่ตั้งของสนามสอบทันที และเก็บสถานที่ตั้งเดิมไว้ในประวัติของสนามสอบ",
    ],
  };

  return (
    <div data-testid="place-request-summary">
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[14rem_1fr]">
            <dt className="font-semibold">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-muted-foreground">{note[typeKey][applied ? 0 : 1]}</p>
    </div>
  );
}
