import ExcelJS from "exceljs";

import { requireAdmin } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { CIVIL_IMPORT_HEADERS } from "@/lib/places";

/** แม่แบบ Excel สำหรับนำเข้าเขตการปกครองบ้านเมือง (หนึ่งแถว = หนึ่งตำบล) */
export async function GET() {
  await requireAdmin();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("เขตการปกครอง");
  const widths = [14, 24, 14, 26, 14, 26, 16];
  sheet.columns = CIVIL_IMPORT_HEADERS.map((header, i) => ({ header, width: widths[i] }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const col of [1, 3, 5, 7]) sheet.getColumn(col).numFmt = "@";

  const help = workbook.addWorksheet("วิธีกรอก");
  help.columns = [{ width: 22 }, { width: 100 }];
  help.addRows([
    ["คอลัมน์", "คำอธิบาย"],
    ["รหัสจังหวัด", "ตัวเลข 2 หลัก ตามรหัสของกรมการปกครอง เช่น 10 = กรุงเทพมหานคร"],
    ["จังหวัด", "ชื่อจังหวัด ไม่ต้องมีคำว่า จังหวัด"],
    ["รหัสอำเภอ", "ตัวเลข 4 หลัก 2 หลักแรกต้องเป็นรหัสจังหวัด เช่น 1001"],
    ["อำเภอ", "ชื่ออำเภอหรือเขต ไม่ต้องมีคำว่า อำเภอ หรือ เขต"],
    ["รหัสตำบล", "ตัวเลข 6 หลัก 4 หลักแรกต้องเป็นรหัสอำเภอ เช่น 100101"],
    ["ตำบล", "ชื่อตำบลหรือแขวง ไม่ต้องมีคำว่า ตำบล หรือ แขวง"],
    ["รหัสไปรษณีย์", "ตัวเลข 5 หลัก"],
    ["", ""],
    ["ข้อควรทราบ", "หนึ่งแถว = หนึ่งตำบล กรอกในแผ่นงานแรกเท่านั้น ห้ามแก้หัวคอลัมน์ในแถวที่ 1"],
    ["", "รหัสที่มีอยู่แล้วจะถูกปรับชื่อและรหัสไปรษณีย์ตามไฟล์ รหัสใหม่จะถูกเพิ่ม ไม่มีการลบ"],
    ["", "กรุงเทพมหานคร (รหัสจังหวัด 10) ระบบใช้คำว่า เขต และ แขวง ให้เอง"],
    ["", "วิธีที่สะดวก: กดปุ่ม ส่งออกทั้งหมด ในหน้าเว็บ แก้ในไฟล์นั้น แล้วนำเข้ากลับ"],
  ]);
  help.getRow(1).font = { bold: true };
  return workbookResponse(workbook, "แม่แบบนำเข้าเขตการปกครองบ้านเมือง.xlsx");
}
