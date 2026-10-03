import "server-only";

import ExcelJS from "exceljs";

/**
 * ตัวช่วยฝั่งเซิร์ฟเวอร์ของตารางข้อมูลกลาง
 * อ่านเงื่อนไขจากที่อยู่หน้าเว็บ (?q= &sort= &dir= &page= &f_ชื่อ=) ให้ทุกหน้าใช้รูปแบบเดียวกัน
 */

export type TableParams = {
  q: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  from: number;
  to: number;
  filters: Record<string, string>;
};

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function read(raw: RawParams, key: string): string {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? "";
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseTableParams(
  raw: RawParams,
  options: { sortable: string[]; defaultSort: string; defaultDir?: "asc" | "desc"; filters?: string[]; pageSize?: number },
): TableParams {
  const pageSize = options.pageSize ?? 10;
  const sortParam = read(raw, "sort");
  const sort = options.sortable.includes(sortParam) ? sortParam : options.defaultSort;
  const dirParam = read(raw, "dir");
  const dir = dirParam === "asc" || dirParam === "desc" ? dirParam : (options.defaultDir ?? "asc");
  const page = Math.max(1, Math.floor(Number(read(raw, "page")) || 1));
  const filters: Record<string, string> = {};
  for (const name of options.filters ?? []) {
    const value = read(raw, `f_${name}`);
    if (value) filters[name] = value;
  }
  return {
    // ตัดอักขระที่มีความหมายพิเศษในเงื่อนไขค้นหาของฐานข้อมูลออก
    q: read(raw, "q").replace(/[,()%*\\]/g, " ").trim().slice(0, 100),
    sort,
    dir,
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
    filters,
  };
}

/** สร้างไฟล์ Excel จากหัวคอลัมน์และแถวข้อมูล แล้วส่งให้ดาวน์โหลด */
export async function xlsxResponse(
  fileName: string,
  sheetName: string,
  columns: { header: string; width?: number }[],
  rows: (string | number | boolean | null)[][],
): Promise<Response> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.addRows(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
