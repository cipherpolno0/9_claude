import ExcelJS from "exceljs";

import { requireQuizManager } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { QUESTION_IMPORT_HEADERS, QUESTION_IMPORT_MAX_ROWS } from "@/lib/quiz";
import { fetchCourses, fetchUnits } from "@/lib/quiz-server";

/** แม่แบบ Excel สำหรับนำเข้าข้อสอบ แผ่นที่ 2 คือรหัสรายวิชาและชื่อหน่วยที่มีในระบบขณะดาวน์โหลด */
export async function GET() {
  await requireQuizManager();
  const [courses, units] = await Promise.all([fetchCourses(), fetchUnits()]);
  const mcq = courses.filter((c) => c.has_mcq);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ข้อสอบ");
  const widths = [22, 28, 60, 30, 30, 30, 30, 10, 50, 10];
  sheet.columns = QUESTION_IMPORT_HEADERS.map((header, i) => ({ header, width: widths[i] }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  // ทุกช่องเก็บเป็นข้อความ เพื่อไม่ให้ Excel แปลงตัวเลือกที่เป็นตัวเลขหรือวันที่เอง
  for (let col = 1; col <= QUESTION_IMPORT_HEADERS.length; col++) sheet.getColumn(col).numFmt = "@";
  for (let r = 2; r <= QUESTION_IMPORT_MAX_ROWS + 1; r++) {
    sheet.getCell(r, 1).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`'รายวิชาและหน่วย'!$A$2:$A$${mcq.length + 1}`],
    };
    sheet.getCell(r, 8).dataValidation = { type: "list", allowBlank: true, formulae: ['"ก,ข,ค,ง"'] };
  }

  const list = workbook.addWorksheet("รายวิชาและหน่วย");
  list.columns = [
    { header: "รหัสรายวิชา (ใช้กรอกคอลัมน์ รายวิชา)", width: 36 },
    { header: "ชื่อรายวิชา", width: 56 },
    { header: "หน่วยที่มีในระบบ (ใช้กรอกคอลัมน์ หน่วย)", width: 50 },
  ];
  list.getRow(1).font = { bold: true };
  list.views = [{ state: "frozen", ySplit: 1 }];
  // ส่วนบน: รายวิชาละ 1 แถว (ใช้เป็นรายการให้เลือกในแผ่น ข้อสอบ) ส่วนล่าง: หน่วยของแต่ละรายวิชา
  for (const c of mcq) list.addRow([c.code, c.name, ""]);
  list.addRow([]);
  const unitHeader = list.addRow(["รหัสรายวิชา", "ชื่อรายวิชา", "หน่วย"]);
  unitHeader.font = { bold: true };
  for (const c of mcq) {
    const mine = units.filter((u) => u.course_id === c.id);
    if (mine.length === 0) list.addRow([c.code, c.name, "(ยังไม่มีหน่วย ต้องเพิ่มที่หน้า รายวิชาและหน่วยการเรียน ก่อน)"]);
    for (const u of mine) list.addRow([c.code, c.name, u.name]);
  }

  const help = workbook.addWorksheet("วิธีกรอก");
  help.columns = [{ width: 18 }, { width: 110 }];
  help.addRows([
    ["คอลัมน์", "คำอธิบาย"],
    ["รายวิชา", "ต้องกรอก เลือกรหัสรายวิชาจากรายการ เช่น ตรี-ประถม-ธรรม (ดูแผ่น รายวิชาและหน่วย) หรือพิมพ์ชื่อรายวิชาเต็มก็ได้"],
    ["หน่วย", "ต้องกรอก ชื่อหน่วยการเรียนของรายวิชานั้น ต้องตรงกับที่มีในระบบ (ดูแผ่น รายวิชาและหน่วย)"],
    ["โจทย์", "ต้องกรอก"],
    ["ก ข ค ง", "ต้องกรอกครบ 4 ตัวเลือก และห้ามซ้ำกัน"],
    ["ข้อถูก", "ต้องกรอก ก ข ค หรือ ง (พิมพ์ 1 2 3 4 หรือ a b c d ก็ได้) แถวที่ไม่มีข้อถูกจะถูกแจ้งว่าผิด"],
    ["เฉลย", "คำอธิบายเฉลย ผู้เรียนเห็นหลังตอบ (เว้นว่างได้)"],
    ["ปี", "ปี พ.ศ. ของข้อสอบสนามหลวง เช่น 2567 (เว้นว่างได้)"],
    ["", ""],
    ["ข้อควรทราบ", "กรอกข้อมูลในแผ่นงานแรก (ข้อสอบ) เท่านั้น ห้ามแก้หัวคอลัมน์ในแถวที่ 1"],
    ["", `นำเข้าได้ครั้งละไม่เกิน ${QUESTION_IMPORT_MAX_ROWS.toLocaleString("th-TH")} ข้อ ทุกข้อที่นำเข้าเป็นฉบับร่าง ระดับความยาก ปานกลาง ต้องตรวจแล้วกดเผยแพร่`],
    ["", "ระบบจะแสดงตัวอย่างและแถวที่ผิดพร้อมเหตุผลให้ตรวจก่อน ถ้ามีแถวผิดแม้แถวเดียวจะยังไม่บันทึก"],
    ["", "ข้อซ้ำ = รายวิชาเดียวกัน โจทย์เดียวกัน และตัวเลือกชุดเดียวกัน (สลับลำดับตัวเลือกก็นับว่าซ้ำ) ข้อที่ซ้ำกับในคลังหรือซ้ำกันในไฟล์จะถูกข้าม"],
    ["", "ถ้าข้อซ้ำนั้นระบุข้อถูกไม่ตรงกัน ระบบจะแจ้งว่าผิด เพื่อให้ตรวจว่าข้อใดถูกต้อง"],
    ["", "วิชากระทู้ธรรมเป็นข้อเขียน ไม่มีข้อสอบปรนัย จึงนำเข้าไม่ได้"],
  ]);
  help.getRow(1).font = { bold: true };

  return workbookResponse(workbook, "แม่แบบนำเข้าข้อสอบ.xlsx");
}
