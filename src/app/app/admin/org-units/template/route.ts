import ExcelJS from "exceljs";

import { IMPORT_HEADERS } from "@/lib/org-units";

/** แม่แบบ Excel สำหรับนำเข้าเขตปกครอง */
export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("เขตปกครอง");
  sheet.columns = [
    { header: IMPORT_HEADERS[0], width: 22 },
    { header: IMPORT_HEADERS[1], width: 40 },
    { header: IMPORT_HEADERS[2], width: 14 },
    { header: IMPORT_HEADERS[3], width: 14 },
    { header: IMPORT_HEADERS[4], width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (let r = 2; r <= 2000; r++) {
    sheet.getCell(r, 3).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"ส่วนกลาง,ภาค,จังหวัด,อำเภอ,ตำบล"'],
    };
    sheet.getCell(r, 4).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"มหานิกาย,ธรรมยุต"'],
    };
  }

  const help = workbook.addWorksheet("วิธีกรอก");
  help.columns = [{ width: 24 }, { width: 90 }];
  help.addRows([
    ["คอลัมน์", "คำอธิบาย"],
    ["รหัสหน่วย", "รหัสประจำหน่วย ห้ามซ้ำกันทั้งระบบ รหัสที่มีในระบบแล้วจะถูกข้าม"],
    ["ชื่อหน่วย", "ชื่อเขตปกครอง"],
    ["ระดับ", "เลือกจากรายการ: ส่วนกลาง ภาค จังหวัด อำเภอ ตำบล"],
    ["นิกาย", "เลือกจากรายการ: มหานิกาย ธรรมยุต (ส่วนกลางเว้นว่าง)"],
    ["รหัสหน่วยเหนือ", "รหัสของหน่วยที่อยู่เหนือขึ้นไปหนึ่งชั้น เช่น จังหวัดใส่รหัสภาค (ส่วนกลางเว้นว่าง)"],
    ["", ""],
    ["ข้อควรทราบ", "กรอกข้อมูลในแผ่นงานแรก (เขตปกครอง) เท่านั้น ห้ามแก้หัวคอลัมน์ในแถวที่ 1"],
    ["", "หน่วยเหนือจะอยู่ในไฟล์เดียวกันหรือมีในระบบอยู่แล้วก็ได้ ลำดับแถวไม่มีผล"],
    ["", "ระบบจะแสดงตัวอย่างและแถวที่ผิดให้ตรวจก่อน ยังไม่บันทึกจนกว่าจะกดยืนยัน"],
  ]);
  help.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename=\"org-units-template.xlsx\"; filename*=UTF-8''" +
        encodeURIComponent("แม่แบบนำเข้าเขตปกครอง.xlsx"),
      "Cache-Control": "no-store",
    },
  });
}
