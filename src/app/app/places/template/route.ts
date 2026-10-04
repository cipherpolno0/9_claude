import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { PLACE_TYPE_LABEL, isPlaceType, needsParentTemple, placeImportHeaders, type PlaceType } from "@/lib/places";

/** แม่แบบ Excel สำหรับนำเข้าสถานที่ของประเภทที่ระบุ (?type=) */
export async function GET(request: NextRequest) {
  await requireMenu("/app/places");
  const raw = request.nextUrl.searchParams.get("type");
  const type: PlaceType = isPlaceType(raw) ? raw : "temple";
  const label = PLACE_TYPE_LABEL[type];
  const headers = placeImportHeaders(type);
  const samnak = needsParentTemple(type);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(label);
  const widths = [16, 34, 14, 14, 20, 20, 20, 20, 14, 26, 12, 12, 18, 24, 16, 16, 16];
  sheet.columns = headers.map((header, i) => ({ header, width: widths[i] }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  // รหัส รหัสไปรษณีย์ รหัสเขต โทรศัพท์ วันที่ เก็บเป็นข้อความ เพื่อไม่ให้ Excel แปลงค่าเอง
  for (const col of [1, 9, 10, 13, 16, ...(samnak ? [17] : [])]) sheet.getColumn(col).numFmt = "@";
  for (let r = 2; r <= 3001; r++) {
    sheet.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: ['"มหานิกาย,ธรรมยุต"'] };
    sheet.getCell(r, 15).dataValidation = { type: "list", allowBlank: true, formulae: ['"เปิดดำเนินการ,ยุบ,ระงับ"'] };
  }

  const help = workbook.addWorksheet("วิธีกรอก");
  help.columns = [{ width: 28 }, { width: 110 }];
  help.addRows([
    ["คอลัมน์", "คำอธิบาย"],
    ["รหัส", "ต้องกรอก ห้ามซ้ำกับรายการอื่นในทะเบียนและในไฟล์"],
    ["ชื่อ", `ต้องกรอก ชื่อ${label} ห้ามซ้ำกับ${label}อื่นในอำเภอเดียวกัน`],
    [
      "นิกาย",
      type === "temple"
        ? "ต้องกรอก เลือกจากรายการ: มหานิกาย ธรรมยุต"
        : samnak
          ? "เว้นว่างได้ (ใช้นิกายของวัดที่ตั้ง) ถ้ากรอกต้องตรงกับวัดที่ตั้ง"
          : "เว้นว่างได้ เลือกจากรายการ: มหานิกาย ธรรมยุต",
    ],
    ["เลขที่", "เลขที่ หมู่ (เว้นว่างได้)"],
    ["ถนน", "ถนน ซอย (เว้นว่างได้)"],
    ["ตำบล", "ชื่อตำบลหรือแขวง ตามเขตการปกครองบ้านเมือง (เว้นว่างได้ถ้าไม่ทราบ)"],
    ["อำเภอ", "ต้องกรอก ชื่ออำเภอหรือเขต ต้องอยู่ในจังหวัดที่กรอก"],
    ["จังหวัด", "ต้องกรอก ชื่อจังหวัด"],
    ["รหัสไปรษณีย์", "ตัวเลข 5 หลัก เว้นว่างได้ ระบบใช้รหัสของตำบลให้"],
    ["รหัสเขตปกครองคณะสงฆ์", "ต้องกรอก รหัสของตำบล (หรืออำเภอ จังหวัด ภาค) ของคณะสงฆ์ที่สังกัด ต้องเป็นเขตที่ท่านบันทึกได้ และนิกายต้องตรงกัน"],
    ["ละติจูด / ลองจิจูด", "ตัวเลขทศนิยม เช่น 13.761039 และ 100.500531 ต้องกรอกทั้งสองช่องหรือเว้นว่างทั้งสองช่อง"],
    ["โทรศัพท์สำนักงาน", "เว้นว่างได้"],
    ["อีเมล", "เว้นว่างได้"],
    ["สถานะ", "เลือกจากรายการ: เปิดดำเนินการ ยุบ ระงับ (เว้นว่าง = เปิดดำเนินการ)"],
    ["วันที่จัดตั้ง", "รูปแบบ วว/ดด/ปปปป เป็นปี พ.ศ. เช่น 15/04/2520 (เว้นว่างได้)"],
    ...(samnak ? [["รหัสวัดที่ตั้ง", "ต้องกรอก รหัสของวัดในทะเบียน (ต้องนำเข้าหรือเพิ่มวัดก่อน)"]] : []),
    ["", ""],
    ["ข้อควรทราบ", `กรอกข้อมูลในแผ่นงานแรก (${label}) เท่านั้น ห้ามแก้หัวคอลัมน์ในแถวที่ 1 ไฟล์นี้ใช้กับประเภท ${label} เท่านั้น`],
    ["", "ระบบจะแสดงตัวอย่างและแถวที่ผิดพร้อมเหตุผลให้ตรวจก่อน ถ้ามีแถวผิดแม้แถวเดียวจะยังไม่บันทึก"],
    ["", "แถวที่รหัสและชื่อตรงกับรายการในทะเบียนอยู่แล้วจะถูกข้าม จึงนำเข้าไฟล์เดิมซ้ำได้"],
    ["", "ผู้รับผิดชอบให้เลือกในหน้าแก้ไขของแต่ละรายการหลังนำเข้า"],
  ]);
  help.getRow(1).font = { bold: true };

  return workbookResponse(workbook, `แม่แบบนำเข้า${label}.xlsx`);
}
