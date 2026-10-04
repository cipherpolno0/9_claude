import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { SCHOOL_TYPE_LABEL, STAFF_STATUS_LABEL, TRACK_LABEL, isTrack, type Track } from "@/lib/education";
import { educationTableParams, queryEducationStaff } from "@/lib/education-server";
import { toBuddhistDateText } from "@/lib/thai";

/** ส่งออกรายชื่อ จศป. ของแท่งที่เปิดอยู่ ตามเงื่อนไขค้นหา กรอง และเรียง ที่ใช้อยู่ (ไม่เกิน 10,000 แถว) */
export async function GET(request: NextRequest) {
  await requireMenu("/app/personnel");
  const search = request.nextUrl.searchParams;
  const track: Track = isTrack(search.get("track")) ? (search.get("track") as Track) : "dhamma";
  const { rows } = await queryEducationStaff(track, educationTableParams(search), true);
  return xlsxResponse(
    `ทะเบียน จศป. ${TRACK_LABEL[track]}.xlsx`,
    TRACK_LABEL[track],
    [
      { header: "คำนำหน้าหรือสมณศักดิ์", width: 22 },
      { header: "ชื่อ", width: 22 },
      { header: "ฉายา", width: 18 },
      { header: "นามสกุล", width: 20 },
      { header: "แท่ง", width: 16 },
      { header: "ประเภทตำแหน่ง", width: 28 },
      { header: "สำนัก", width: 30 },
      { header: "ประเภทสำนัก", width: 18 },
      { header: "เขตที่รับผิดชอบ", width: 34 },
      { header: "รหัสเขตปกครอง", width: 22 },
      { header: "วันที่เริ่ม (พ.ศ.)", width: 16 },
      { header: "เลขที่คำสั่งแต่งตั้ง", width: 20 },
      { header: "วิชาที่สอน", width: 30 },
      { header: "สถานะ", width: 16 },
    ],
    rows.map((e) => [
      e.title,
      e.first_name,
      e.monastic_name,
      e.last_name,
      TRACK_LABEL[e.track],
      e.position_name,
      e.school_name,
      SCHOOL_TYPE_LABEL[e.school_type] ?? "",
      e.org_unit_name,
      e.org_unit_code,
      toBuddhistDateText(e.started_on),
      e.order_no,
      e.subjects,
      e.is_active ? STAFF_STATUS_LABEL[e.status] : "ยกเลิก",
    ]),
  );
}
