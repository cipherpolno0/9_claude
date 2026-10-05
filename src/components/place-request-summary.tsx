import Link from "next/link";

import {
  DEPARTMENTS,
  PLACE_REQUEST_LABEL,
  SAMNAK_TYPE_LABEL,
  readPlaceRequestPayload,
  type PlaceRequestType,
} from "@/lib/place-requests";

/** สรุปคำขอจัดตั้งหรือขอยุบสำนัก ในหน้ารายละเอียดคำขอ (เหตุผลแสดงแยกในหัวข้อ เหตุผล ของหน้ากลาง) */
export function PlaceRequestSummary({
  typeKey,
  payload,
  applied,
  canOpenPlace,
}: {
  typeKey: PlaceRequestType;
  payload: Record<string, unknown>;
  /** อนุมัติขั้นสุดท้ายแล้ว */
  applied: boolean;
  /** ผู้ดูมีสิทธิ์เปิดทะเบียนสถานที่ (แสดงลิงก์ไปยังสำนักและวัดที่ตั้ง) */
  canOpenPlace: boolean;
}) {
  const p = readPlaceRequestPayload(payload);
  const establish = typeKey === "samnak_establish";
  const typeLabel = p.placeType ? SAMNAK_TYPE_LABEL[p.placeType] : "-";
  const link = (id: string, label: string) =>
    canOpenPlace && id ? (
      <Link href={`/app/places/${id}`} className="text-primary underline underline-offset-4">
        {label}
      </Link>
    ) : (
      label
    );

  const rows: [string, React.ReactNode][] = [
    ["เรื่อง", `${PLACE_REQUEST_LABEL[typeKey]}${typeLabel === "-" ? "สำนัก" : typeLabel}`],
    [establish ? "ชื่อสำนักที่ขอ" : "สำนักที่ขอยุบ", establish && !p.placeId ? p.name || "-" : link(p.placeId, p.name || "-")],
    ["ประเภท", typeLabel],
    ["วัดที่ตั้ง", p.templeName ? link(p.templeId, p.templeName) : "-"],
    ["เขตคณะสงฆ์", p.unitName || "-"],
  ];
  if (establish) rows.push(["เจ้าสำนัก", p.headName || "-"]);
  if (p.placeCode) rows.push(["รหัสในทะเบียนสถานที่", p.placeCode]);

  return (
    <div data-testid="place-request-summary">
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[12rem_1fr]">
            <dt className="font-semibold">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {establish ? (
        <>
          <h3 className="mt-4 font-bold text-primary">จำนวนครูและนักเรียน แยกตามแผนก</h3>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-72 border-collapse" data-testid="summary-counts">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="py-1.5 pr-3">แผนก</th>
                  <th scope="col" className="py-1.5 pr-3 text-right">ครู</th>
                  <th scope="col" className="py-1.5 text-right">นักเรียน</th>
                </tr>
              </thead>
              <tbody>
                {DEPARTMENTS.map((d) => (
                  <tr key={d.key} className="border-b">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">{d.label}</th>
                    <td className="py-1.5 pr-3 text-right">{p.counts[d.key].teachers.toLocaleString("th-TH")}</td>
                    <td className="py-1.5 text-right">{p.counts[d.key].students.toLocaleString("th-TH")}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-1.5 pr-3 text-left font-semibold">รวม</th>
                  <td className="py-1.5 pr-3 text-right font-semibold">
                    {DEPARTMENTS.reduce((sum, d) => sum + p.counts[d.key].teachers, 0).toLocaleString("th-TH")}
                  </td>
                  <td className="py-1.5 text-right font-semibold">
                    {DEPARTMENTS.reduce((sum, d) => sum + p.counts[d.key].students, 0).toLocaleString("th-TH")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3 className="mt-4 font-bold text-primary">อาคารสถานที่</h3>
          <p className="mt-1 whitespace-pre-wrap">{p.buildings || "-"}</p>
        </>
      ) : (
        <>
          <h3 className="mt-4 font-bold text-primary">แผนรองรับนักเรียนและบุคลากร</h3>
          <p className="mt-1 whitespace-pre-wrap">{p.supportPlan || "-"}</p>
        </>
      )}

      <p className="mt-3 text-muted-foreground">
        {applied
          ? establish
            ? "ดำเนินการแล้ว: ระบบเพิ่มสำนักนี้ในทะเบียนสถานที่ สถานะ เปิดดำเนินการ"
            : "ดำเนินการแล้ว: ระบบเปลี่ยนสถานะของสำนักเป็น ยุบ และแจ้งเตือนผู้เกี่ยวข้องแล้ว"
          : establish
            ? "เมื่อได้รับอนุมัติขั้นสุดท้าย ระบบจะเพิ่มสำนักนี้ในทะเบียนสถานที่ สถานะ เปิดดำเนินการ (ที่ตั้งและเขตคณะสงฆ์ตามวัดที่ตั้ง)"
            : "เมื่อได้รับอนุมัติขั้นสุดท้าย ระบบจะเปลี่ยนสถานะของสำนักเป็น ยุบ และแจ้งเตือนบุคลากรและผู้ดูแลสนามสอบที่ผูกอยู่"}
      </p>
    </div>
  );
}
