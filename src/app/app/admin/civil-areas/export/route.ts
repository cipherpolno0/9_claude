import { requireAdmin } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { CIVIL_IMPORT_HEADERS } from "@/lib/places";
import { fetchCivilRows } from "@/lib/places-server";

const WIDTHS = [14, 24, 14, 26, 14, 26, 16];

/** ส่งออกเขตการปกครองบ้านเมืองทั้งหมด ในรูปแบบเดียวกับแม่แบบนำเข้า (แก้ไขแล้วนำเข้ากลับได้) */
export async function GET() {
  await requireAdmin();
  const rows = await fetchCivilRows();
  return xlsxResponse(
    "เขตการปกครองบ้านเมือง.xlsx",
    "เขตการปกครอง",
    CIVIL_IMPORT_HEADERS.map((header, i) => ({ header, width: WIDTHS[i] })),
    rows.map((r) => [
      String(r.province_code),
      r.province_name,
      String(r.district_code),
      r.district_name,
      String(r.subdistrict_code),
      r.subdistrict_name,
      r.postal_code,
    ]),
  );
}
