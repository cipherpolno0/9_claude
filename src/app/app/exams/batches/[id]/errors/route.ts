import ExcelJS from "exceljs";

import { requireMenu } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { CANDIDATE_STATUS_LABEL, maskedId } from "@/lib/exam-batches";
import { fetchBatch, fetchErrorCandidates } from "@/lib/exam-batches-server";
import { templateFileName } from "@/lib/exam-forms";

/**
 * รายการข้อผิดพลาดของชุดเป็น Excel: หนึ่งบรรทัดต่อหนึ่งข้อผิดพลาด บอกแถวในไฟล์ ช่อง และเหตุผล
 * ใช้แก้ไฟล์ต้นฉบับแล้วอัปโหลดใหม่ (เลขประจำตัวแสดงเฉพาะ 4 ตัวท้าย)
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/exams");
  const { id } = await params;
  const batch = await fetchBatch(id);
  if (!batch) return new Response("ไม่พบชุดรายชื่อ", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const rows = await fetchErrorCandidates(batch.id);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ข้อผิดพลาด", { views: [{ state: "frozen", ySplit: 3 }] });
  sheet.columns = [
    { key: "row_no", width: 10 },
    { key: "seq", width: 8 },
    { key: "name", width: 36 },
    { key: "nid", width: 18 },
    { key: "field", width: 28 },
    { key: "message", width: 70 },
    { key: "status", width: 22 },
  ];
  sheet.getCell("A1").value = `รายการข้อผิดพลาด บัญชี ${batch.template.code} ปี ${batch.round.year_be} · ${batch.place.name} · สนามสอบ ${batch.venue.name} (${batch.venue.code})`;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `ไฟล์ ${batch.file_name} · ไม่ผ่าน ${batch.error_count} แถว จากทั้งหมด ${batch.row_count} แถว`;
  const head = sheet.getRow(3);
  head.values = ["แถวในไฟล์", "เลขที่", "ชื่อ นามสกุล", "เลขประจำตัว", "ช่อง", "ข้อผิดพลาด", "สถานะ"];
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E1" } };
    c.border = { bottom: { style: "thin" } };
  });

  for (const c of rows) {
    const name = [c.title, c.first_name, c.monastic_name, c.last_name].filter(Boolean).join(" ");
    const errors = c.errors.length ? c.errors : [{ field: "", label: "", message: "" }];
    for (const e of errors) {
      sheet.addRow({
        row_no: c.row_no,
        seq: c.seq ?? "",
        name,
        nid: c.national_id_last4 ? maskedId(c) : "",
        field: e.label,
        message: e.message,
        status: CANDIDATE_STATUS_LABEL[c.status],
      });
    }
  }
  sheet.getColumn("message").alignment = { wrapText: true, vertical: "top" };

  return workbookResponse(workbook, templateFileName({ code: batch.template.code, exam_type: batch.round.exam_type, level: batch.round.level }, ["ข้อผิดพลาด", batch.round.year_be, batch.place.name]));
}
