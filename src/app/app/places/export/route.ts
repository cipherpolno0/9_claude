import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { SECT_LABEL } from "@/lib/org-units";
import { PLACE_STATUS_LABEL, PLACE_TYPE_LABEL, isPlaceType, needsParentTemple, type PlaceType } from "@/lib/places";
import { placesTableParams, queryPlaces } from "@/lib/places-server";
import { toBuddhistDateText } from "@/lib/thai";

/** ส่งออกทะเบียนสถานที่ของประเภทที่เปิดอยู่ ตามเงื่อนไขค้นหา กรอง และเรียง ที่ใช้อยู่ (ไม่เกิน 10,000 แถว) */
export async function GET(request: NextRequest) {
  await requireMenu("/app/places");
  const search = request.nextUrl.searchParams;
  const type: PlaceType = isPlaceType(search.get("type")) ? (search.get("type") as PlaceType) : "temple";
  const { rows } = await queryPlaces(type, placesTableParams(search), true);
  const samnak = needsParentTemple(type);
  return xlsxResponse(
    `ทะเบียน${PLACE_TYPE_LABEL[type]}.xlsx`,
    PLACE_TYPE_LABEL[type],
    [
      { header: "รหัส", width: 16 },
      { header: "ชื่อ", width: 34 },
      { header: "นิกาย", width: 14 },
      { header: "เลขที่", width: 14 },
      { header: "ถนน", width: 20 },
      { header: "ตำบล", width: 20 },
      { header: "อำเภอ", width: 20 },
      { header: "จังหวัด", width: 20 },
      { header: "รหัสไปรษณีย์", width: 14 },
      { header: "เขตปกครองคณะสงฆ์", width: 34 },
      { header: "รหัสเขตปกครองคณะสงฆ์", width: 24 },
      { header: "ละติจูด", width: 12 },
      { header: "ลองจิจูด", width: 12 },
      { header: "โทรศัพท์สำนักงาน", width: 18 },
      { header: "อีเมล", width: 24 },
      { header: "ผู้รับผิดชอบ", width: 30 },
      { header: "สถานะ", width: 16 },
      { header: "วันที่จัดตั้ง (พ.ศ.)", width: 18 },
      ...(samnak ? [{ header: "วัดที่ตั้ง", width: 30 }, { header: "รหัสวัดที่ตั้ง", width: 16 }] : []),
    ],
    rows.map((p) => [
      p.code,
      p.name,
      p.sect ? SECT_LABEL[p.sect] : "",
      p.house_no,
      p.road,
      p.subdistrict_name ?? "",
      p.district_name ?? "",
      p.province_name ?? "",
      p.postal_code,
      p.org_unit_name,
      p.org_unit_code,
      p.latitude,
      p.longitude,
      p.office_phone,
      p.email,
      p.responsible_name ?? "",
      p.is_active ? PLACE_STATUS_LABEL[p.status] : "ปิดใช้งาน",
      toBuddhistDateText(p.established_on),
      ...(samnak ? [p.parent_name ?? "", p.parent_code ?? ""] : []),
    ]),
  );
}
