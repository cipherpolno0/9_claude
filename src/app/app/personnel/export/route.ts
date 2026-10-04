import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { PERSON_TYPE_LABEL, countsPhansa, personStatusLabel, phansaOf } from "@/lib/persons";
import { personnelTableParams, queryPersonnel } from "@/lib/persons-server";

/**
 * ส่งออกรายชื่อบุคลากรเป็น Excel ตามเงื่อนไขค้นหา กรอง และเรียง ที่ใช้อยู่ (ไม่เกิน 10,000 แถว)
 * ไม่ส่งออกเลขประจำตัวประชาชน วันเกิด และเบอร์ติดต่อ
 */
export async function GET(request: NextRequest) {
  await requireMenu("/app/personnel");
  const params = personnelTableParams(request.nextUrl.searchParams);
  const { rows } = await queryPersonnel(params, true);
  return xlsxResponse(
    "ทะเบียนบุคคล.xlsx",
    "ทะเบียนบุคคล",
    [
      { header: "ประเภท", width: 12 },
      { header: "คำนำหน้าหรือสมณศักดิ์", width: 22 },
      { header: "ชื่อ", width: 22 },
      { header: "ฉายา", width: 18 },
      { header: "นามสกุล", width: 20 },
      { header: "วัดที่สังกัด", width: 26 },
      { header: "เขตปกครอง", width: 34 },
      { header: "รหัสเขตปกครอง", width: 22 },
      { header: "ตำแหน่งปัจจุบัน", width: 50 },
      { header: "พรรษา", width: 10 },
      { header: "สถานะ", width: 16 },
    ],
    rows.map((p) => [
      PERSON_TYPE_LABEL[p.person_type],
      p.title,
      p.first_name,
      p.monastic_name,
      p.last_name,
      p.temple_name,
      p.org_unit_name,
      p.org_unit_code,
      (p.positions ?? "").replace(/\n/g, ", "),
      countsPhansa(p) ? phansaOf(p.ordination_date) : null,
      p.is_active ? personStatusLabel(p.status, p.person_type) : "ปิดใช้งาน",
    ]),
  );
}
