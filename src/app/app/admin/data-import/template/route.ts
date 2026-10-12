import ExcelJS from "exceljs";

import { requireAdmin } from "@/lib/auth/guards";
import { APPOINTMENT_IMPORT_HEADERS, USER_IMPORT_HEADERS, VENUE_IMPORT_HEADERS } from "@/lib/data-import";
import { workbookResponse } from "@/lib/excel";
import { createClient } from "@/lib/supabase/server";

/** แม่แบบ Excel ของการนำเข้าตำแหน่ง สนามสอบ ผู้ใช้ (?kind=appointments|venues|users) */
export async function GET(request: Request) {
  await requireAdmin();
  const kind = new URL(request.url).searchParams.get("kind");
  const supabase = await createClient();
  const workbook = new ExcelJS.Workbook();
  const help = (rows: string[][]) => {
    const sheet = workbook.addWorksheet("วิธีกรอก");
    sheet.columns = [{ width: 28 }, { width: 100 }];
    sheet.addRows([["คอลัมน์", "คำอธิบาย"], ...rows]);
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  };
  const main = (name: string, headers: readonly string[], widths: number[], textCols: number[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = headers.map((header, i) => ({ header, width: widths[i] ?? 18 }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    // เก็บเป็นข้อความ ไม่ให้ Excel แปลงรหัสหรือวันที่เอง
    for (const col of textCols) sheet.getColumn(col).numFmt = "@";
    return sheet;
  };

  if (kind === "appointments") {
    const { data: positions } = await supabase.from("position_types").select("name").eq("is_active", true).order("sort_order");
    const sheet = main("ตำแหน่ง", APPOINTMENT_IMPORT_HEADERS, [20, 20, 16, 18, 26, 22, 14, 16], [1, 6, 7, 8]);
    const names = (positions ?? []).map((p) => p.name);
    if (names.length && names.join(",").length < 250) {
      for (let r = 2; r <= 2001; r++) {
        sheet.getCell(r, 5).dataValidation = { type: "list", allowBlank: true, formulae: [`"${names.join(",")}"`] };
      }
    }
    help([
      ["เลขประจำตัวประชาชน", "ถ้ากรอก ระบบหาบุคคลด้วยเลขนี้ (แม่นยำที่สุด) ถ้าว่าง ระบบหาด้วย ชื่อ + ฉายา + นามสกุล ซึ่งต้องตรงกับทะเบียนทุกตัวอักษร"],
      ["ชื่อ ฉายา นามสกุล", "ตามทะเบียนบุคคล (นำเข้าบุคคลที่เมนู บุคลากร ก่อน)"],
      ["ตำแหน่ง", `ชื่อตำแหน่งตามที่ตั้งไว้ในระบบ: ${names.join(", ")}`],
      ["รหัสเขตปกครอง", "รหัสหน่วยที่ดำรงตำแหน่ง ตามหน้า ผู้ดูแลระบบ > เขตปกครอง"],
      ["วันแต่งตั้ง", "วว/ดด/ปปปป เป็นปี พ.ศ. เช่น 01/10/2568"],
      ["เลขที่คำสั่ง", "ไม่บังคับ"],
      ["กติกา", "ผิดแถวเดียวไม่บันทึกทั้งชุด วาระที่มีอยู่แล้ว (บุคคล ตำแหน่ง หน่วย วันแต่งตั้ง ตรงกัน) จะถูกข้าม จำนวนต่อหน่วยตรวจตามค่าตั้งของตำแหน่ง"],
    ]);
    return workbookResponse(workbook, "แม่แบบนำเข้าตำแหน่ง.xlsx");
  }
  if (kind === "venues") {
    const sheet = main("สนามสอบ", VENUE_IMPORT_HEADERS, [14, 32, 14, 16, 18, 16, 14, 30], [1, 5]);
    for (let r = 2; r <= 2001; r++) {
      sheet.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: ['"นักธรรม,ธรรมศึกษา"'] };
    }
    help([
      ["รหัสสนามสอบ", "รหัสตามที่แม่กองธรรมกำหนด ห้ามซ้ำ (รหัสเดิมชื่อเดิมสถานที่เดิม = ข้าม)"],
      ["ประเภท", "นักธรรม หรือ ธรรมศึกษา"],
      ["ชั้นที่เปิดสอบ", "ตรี โท เอก คั่นด้วยจุลภาค เช่น ตรี,โท,เอก"],
      ["รหัสสถานที่ตั้ง", "รหัสวัดหรือสถานที่ในทะเบียนสถานที่ (นำเข้าสถานที่ก่อน) เขตคณะสงฆ์ของสนามใช้ตามสถานที่ตั้ง"],
      ["จำนวนผู้เข้าสอบโดยประมาณ / ปีการศึกษาที่เริ่ม / หมายเหตุ", "ไม่บังคับ ปีเป็น พ.ศ."],
      ["หลังนำเข้า", "ประธานสนามสอบและผู้รับข้อสอบ กรอกที่หน้าสนามสอบ แท็บ ประธานและผู้รับข้อสอบ"],
    ]);
    return workbookResponse(workbook, "แม่แบบนำเข้าสนามสอบ.xlsx");
  }
  if (kind === "users") {
    const { data: roles } = await supabase.from("roles").select("name").order("name");
    const sheet = main("ผู้ใช้", USER_IMPORT_HEADERS, [30, 16, 20, 16, 20, 16, 22, 22], [6, 8]);
    const names = (roles ?? []).map((r) => r.name);
    if (names.length && names.join(",").length < 250) {
      for (let r = 2; r <= 301; r++) {
        sheet.getCell(r, 7).dataValidation = { type: "list", allowBlank: true, formulae: [`"${names.join(",")}"`] };
      }
    }
    help([
      ["อีเมล", "ต้องไม่ซ้ำ ผู้ใช้จะได้รับลิงก์ตั้งรหัสผ่านทางอีเมลนี้ อีเมลที่มีบัญชีอยู่แล้วจะถูกข้าม"],
      ["ชื่อ", "ต้องกรอก ส่วนคำนำหน้า ฉายา นามสกุล เบอร์ติดต่อ ไม่บังคับ"],
      ["บทบาท", `ชื่อบทบาท: ${names.join(", ")}`],
      ["รหัสเขตปกครอง", "ต้องกรอกเมื่อบทบาทผูกกับเขต (เช่น เจ้าคณะ เลขานุการ เจ้าหน้าที่) ส่วนกลาง ผู้ดูแลระบบ ผู้เรียน ไม่ต้องกรอก"],
      ["ครั้งละ", "ไม่เกิน 300 บัญชี"],
      ["หลังนำเข้า", "ผู้ใช้เปิดหน้า เข้าสู่ระบบ > ลืมรหัสผ่าน กรอกอีเมล แล้วตั้งรหัสผ่าน (อย่างน้อย 12 ตัว) บทบาทที่บังคับยืนยันตัวตน 2 ขั้นจะตั้งค่าเมื่อเข้าสู่ระบบครั้งแรก"],
    ]);
    return workbookResponse(workbook, "แม่แบบนำเข้าผู้ใช้.xlsx");
  }
  return new Response("ไม่พบแม่แบบ", { status: 404 });
}
