import type { NextRequest } from "next/server";

import { xlsxResponse } from "@/lib/data-table";
import { SECT_LABEL, type Sect } from "@/lib/org-units";
import { PLACE_STATUS_LABEL, type PlaceStatus } from "@/lib/places";
import { PUBLIC_EXPORT_LIMIT, findRegistryKind } from "@/lib/registry";
import { queryPublicPlaces, queryPublicVenues, readRegistryFilters, registryTableParams } from "@/lib/registry-server";
import { VENUE_STATUS_LABEL, VENUE_TYPE_LABEL, venueLevelsText } from "@/lib/venues";

const sectLabel = (sect: string | null) => (sect ? (SECT_LABEL[sect as Sect] ?? "") : "");

/**
 * ส่งออกทะเบียนสาธารณะเป็น Excel ตามเงื่อนไขค้นหาและตัวกรองที่ใช้อยู่ จำกัด 5,000 แถวต่อครั้ง
 * มีเฉพาะข้อมูลของสถานที่และสนามสอบที่แสดงบนหน้าสาธารณะ ไม่มีชื่อบุคคลหรือเบอร์ส่วนตัว
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const kind = findRegistryKind((await params).kind);
  if (!kind) return new Response("ไม่พบทะเบียนนี้", { status: 404 });
  const venues = kind.placeType === null;
  const filters = readRegistryFilters(registryTableParams(request.nextUrl.searchParams), venues);
  const address = [
    { header: "เลขที่", width: 14 },
    { header: "ถนน", width: 18 },
    { header: "ตำบล", width: 20 },
    { header: "อำเภอ", width: 20 },
    { header: "จังหวัด", width: 18 },
    { header: "รหัสไปรษณีย์", width: 14 },
  ];
  try {
    if (venues) {
      const { rows } = await queryPublicVenues(filters, PUBLIC_EXPORT_LIMIT, 0);
      return xlsxResponse(
        "ทะเบียนสนามสอบ.xlsx",
        "สนามสอบ",
        [
          { header: "รหัส", width: 14 },
          { header: "สนามสอบ", width: 34 },
          { header: "ประเภท", width: 12 },
          { header: "ชั้นที่เปิดสอบ", width: 20 },
          { header: "สถานที่ตั้ง", width: 30 },
          ...address,
          { header: "ภาค (คณะสงฆ์)", width: 22 },
          { header: "นิกาย", width: 12 },
          { header: "สถานะ", width: 10 },
        ],
        rows.map((v) => [
          v.code,
          v.name,
          VENUE_TYPE_LABEL[v.venue_type] ?? v.venue_type,
          venueLevelsText(v.levels),
          v.place_name,
          v.house_no,
          v.road,
          v.subdistrict_name ?? "",
          v.district_name ?? "",
          v.province_name ?? "",
          v.postal_code,
          v.region_name ?? "",
          sectLabel(v.sect),
          VENUE_STATUS_LABEL[v.status] ?? v.status,
        ]),
      );
    }
    const { rows } = await queryPublicPlaces(kind.placeType, filters, PUBLIC_EXPORT_LIMIT, 0);
    return xlsxResponse(
      `ทะเบียน${kind.title}.xlsx`,
      kind.title,
      [
        { header: "รหัส", width: 14 },
        { header: "ชื่อ", width: 34 },
        { header: "นิกาย", width: 12 },
        ...address,
        { header: "ภาค (คณะสงฆ์)", width: 22 },
        { header: "โทรศัพท์สำนักงาน", width: 18 },
        { header: "สถานะ", width: 16 },
        { header: "วัดที่ตั้ง", width: 30 },
      ],
      rows.map((p) => [
        p.code,
        p.name,
        sectLabel(p.sect),
        p.house_no,
        p.road,
        p.subdistrict_name ?? "",
        p.district_name ?? "",
        p.province_name ?? "",
        p.postal_code,
        p.region_name ?? "",
        p.office_phone,
        PLACE_STATUS_LABEL[p.status as PlaceStatus] ?? p.status,
        p.parent_name ?? "",
      ]),
    );
  } catch {
    return new Response("อ่านข้อมูลไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง", { status: 503 });
  }
}
