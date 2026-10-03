import type { NextRequest } from "next/server";

import { requireAccountManager } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { LEVEL_LABEL, SECT_LABEL } from "@/lib/org-units";

import { demoTableParams, queryDemoUnits } from "../query";

/** ส่งออก Excel ตามเงื่อนไขค้นหา กรอง และเรียง ที่ใช้อยู่ในตาราง (ทุกหน้า ไม่เกิน 10,000 แถว) */
export async function GET(request: NextRequest) {
  await requireAccountManager();
  const params = demoTableParams(request.nextUrl.searchParams);
  const { rows } = await queryDemoUnits(params, true);
  return xlsxResponse(
    "เขตปกครอง.xlsx",
    "เขตปกครอง",
    [
      { header: "รหัสหน่วย", width: 24 },
      { header: "ชื่อหน่วย", width: 40 },
      { header: "ระดับ", width: 14 },
      { header: "นิกาย", width: 14 },
      { header: "สถานะ", width: 14 },
    ],
    rows.map((u) => [
      u.code,
      u.name,
      LEVEL_LABEL[u.level],
      u.sect ? SECT_LABEL[u.sect] : "",
      u.is_active ? "ใช้งาน" : "ปิดใช้งาน",
    ]),
  );
}
