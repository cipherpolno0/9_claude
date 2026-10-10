import ExcelJS from "exceljs";

import { requireMenu } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { HISTORY_IMPORT_HEADERS } from "@/lib/exam-results";

/** แม่แบบนำเข้าผลสอบได้ย้อนหลัง (หัวคอลัมน์แถวแรก + คำอธิบายในแผ่นงานที่สอง) */
export async function GET() {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) {
    return new Response("ดาวน์โหลดได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ผลสอบได้ย้อนหลัง", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.getRow(1).values = [...HISTORY_IMPORT_HEADERS];
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [20, 12, 18, 16, 18, 14, 12, 8, 14, 16, 26, 20].map((width) => ({ width }));
  for (let i = 2; i <= 2001; i++) {
    sheet.getCell(`A${i}`).numFmt = "@";
    sheet.getCell(`G${i}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"นักธรรม,ธรรมศึกษา"'] };
    sheet.getCell(`H${i}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"ตรี,โท,เอก"'] };
  }
  const help = workbook.addWorksheet("คำอธิบาย");
  help.columns = [{ width: 24 }, { width: 90 }];
  const rows: [string, string][] = [
    ["เลขประจำตัวประชาชน", "13 หลัก (เลขตรวจสอบต้องตรง) ถ้าไม่มีให้เว้นว่างและกรอกวันเกิดแทน ระบบเก็บแบบเข้ารหัส"],
    ["ชื่อ นามสกุล", "บังคับกรอก ใช้คู่กับวันเกิดเพื่อยืนยันตัวบุคคลเมื่อไม่มีเลขประจำตัว"],
    ["วันเกิด", "วัน/เดือน/ปี พ.ศ. เช่น 1/1/2540"],
    ["ประเภท / ชั้น", "นักธรรม หรือ ธรรมศึกษา / ตรี โท เอก"],
    ["ปี พ.ศ. ที่สอบได้", "ปี 4 หลัก เช่น 2560"],
    ["การใช้งาน", "ผลสอบได้ย้อนหลังใช้เป็นหลักฐานคุณสมบัติเมื่อสมัครชั้นถัดไป บุคคล ประเภท และชั้นเดียวกันที่มีอยู่แล้วจะถูกข้าม"],
  ];
  rows.forEach((r) => help.addRow(r));
  help.getColumn(1).font = { bold: true };
  return workbookResponse(workbook, "แม่แบบผลสอบได้ย้อนหลัง.xlsx");
}
