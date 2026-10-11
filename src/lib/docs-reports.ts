import "server-only";

import {
  DOC_CLASS_LABEL,
  DOC_REPORT_LABEL,
  DOC_URGENCY_LABEL,
  THAI_MONTHS,
  docRefLabel,
  pendingWaitText,
  type DocReportKind,
} from "@/lib/docs";
import { fetchDurationReport, fetchPendingReport, fetchRegisterReport } from "@/lib/docs-server";
import { fiscalYearRange, type ReportColumn, type ReportTable } from "@/lib/reports";
import { thaiDate, thaiDateTime } from "@/lib/thai";

/**
 * รายงานสารบรรณ 3 แบบ บน ReportTable กลาง (บนจอ หน้าพิมพ์ Excel ใช้ชุดเดียวกัน)
 * ฐานข้อมูลกรองสิทธิ์เอง: หน่วยที่ผู้ใช้ดูสารบรรณได้ หนังสือลับที่มองไม่เห็นแสดงเพียงเลขและวันที่
 */

export type DocReportScope = {
  unit: { id: string; name: string };
  direction: "receive" | "send";
  year: number;
  month: number;
  fiscalYear: number;
};

const HIDDEN = "(หนังสือลับ)";
const num = (header: string, width = 11): ReportColumn => ({ header, width, align: "right" });

async function registerReport(s: DocReportScope): Promise<ReportTable> {
  const rows = await fetchRegisterReport(s.unit.id, s.direction, s.year, s.month);
  const receive = s.direction === "receive";
  return {
    kind: `docs-register-${s.direction}`,
    title: receive ? "ทะเบียนหนังสือรับ" : "ทะเบียนหนังสือส่ง",
    subtitle: `${s.unit.name} · เดือน${THAI_MONTHS[s.month - 1]} ${s.year}`,
    note: receive
      ? "เรียงตามเลขทะเบียนรับ นับตามวันที่ลงรับ รวมรายการที่ยกเลิกและปิดเรื่องแล้ว"
      : "เรียงตามชุดเลขและเลขทะเบียนส่ง นับตามวันที่ของหนังสือ รวมรายการที่ยกเลิกและปิดเรื่องแล้ว",
    columns: [
      { header: receive ? "เลขทะเบียนรับ" : "เลขทะเบียนส่ง", width: 10, align: "center" },
      { header: "ที่", width: 18 },
      { header: "ลงวันที่", width: 12 },
      { header: "จาก", width: 22 },
      { header: "ถึง", width: 22 },
      { header: "เรื่อง", width: 40 },
      { header: "การปฏิบัติ", width: 30 },
      { header: "หมายเหตุ", width: 18 },
    ],
    rows: rows.map((r) => [
      r.seq_no ?? "",
      r.doc_no || "-",
      thaiDate(r.doc_date, "short"),
      r.masked ? HIDDEN : r.from_text || (receive ? "-" : s.unit.name),
      r.masked ? "" : r.to_text || "-",
      r.masked
        ? HIDDEN
        : [r.urgency !== "normal" ? `[${DOC_URGENCY_LABEL[r.urgency]}]` : "", r.classification !== "normal" ? `[${DOC_CLASS_LABEL[r.classification]}]` : "", r.subject]
            .filter(Boolean)
            .join(" "),
      r.action_text,
      [receive && r.received_at ? `รับ ${thaiDateTime(r.received_at)}` : "", r.note].filter(Boolean).join(" · "),
    ]),
    footer: [`รวม ${rows.length.toLocaleString("th-TH")} รายการ`, "", "", "", "", "", "", ""],
    rowLinks: rows.map((r) => (r.masked ? null : `/app/docs/${r.id}`)),
  };
}

async function pendingReport(s: DocReportScope): Promise<ReportTable> {
  const rows = await fetchPendingReport(s.unit.id);
  return {
    kind: "docs-pending",
    title: DOC_REPORT_LABEL.pending,
    subtitle: `${s.unit.name} · ข้อมูล ณ ${thaiDate(new Date().toISOString())}`,
    note: "หนังสือที่ยังไม่ปิดเรื่อง เรียงจากค้างนานสุด จำนวนวันนับจากวันลงรับ (หนังสือรับ) หรือวันออกเลข (หนังสือส่ง)",
    columns: [
      { header: "ทะเบียน", width: 22 },
      { header: "เรื่อง", width: 40 },
      { header: "ชั้นความเร็ว", width: 11 },
      { header: "เริ่ม", width: 12 },
      num("ค้าง (วัน)", 9),
      { header: "รอ", width: 34 },
      { header: "ผู้ถือเรื่อง", width: 24 },
    ],
    rows: rows.map((r) => [
      `${r.direction === "receive" ? "รับ" : "ส่ง"} ${docRefLabel(r)}`,
      r.masked ? HIDDEN : r.subject,
      DOC_URGENCY_LABEL[r.urgency],
      thaiDate(r.started_at, "short"),
      r.days,
      r.masked ? "" : pendingWaitText(r),
      r.masked ? "" : r.holders || "เจ้าหน้าที่สารบรรณ",
    ]),
    footer: [`รวม ${rows.length.toLocaleString("th-TH")} ฉบับ`, "", "", "", "", "", ""],
    rowLinks: rows.map((r) => (r.masked ? null : `/app/docs/${r.id}/track`)),
  };
}

async function durationReport(s: DocReportScope): Promise<ReportTable> {
  const rows = await fetchDurationReport(s.fiscalYear);
  const closed = rows.reduce((n, r) => n + r.closed_count, 0);
  const acts = rows.reduce((n, r) => n + r.act_done, 0);
  const weighted = (pick: (r: (typeof rows)[number]) => [number | null, number], total: number) =>
    total ? Math.round((rows.reduce((n, r) => n + (pick(r)[0] ?? 0) * pick(r)[1], 0) / total) * 10) / 10 : "-";
  return {
    kind: "docs-duration",
    title: DOC_REPORT_LABEL.duration,
    subtitle: `ปีงบประมาณ ${s.fiscalYear} (${fiscalYearRange(s.fiscalYear)}) · ทุกหน่วยที่ท่านดูสารบรรณได้`,
    note: "หนังสือรับ: นับจากวันเวลาลงรับถึงวันเวลาปิดเรื่อง เฉพาะเรื่องที่ปิดในปีงบประมาณนี้ / งานที่มอบหมาย: นับจากวันมอบหมายถึงวันรายงานผล",
    columns: [
      { header: "หน่วย", width: 30 },
      num("หนังสือรับในปี"),
      num("ปิดเรื่องแล้ว"),
      num("เฉลี่ย (วัน)"),
      num("เร็วสุด (วัน)"),
      num("ช้าสุด (วัน)"),
      num("ยังไม่ปิด (ขณะนี้)", 12),
      num("งานมอบหมายที่รายงานผล", 14),
      num("เฉลี่ยงานมอบหมาย (วัน)", 14),
      num("รายงานผลเกินกำหนด", 12),
    ],
    rows: rows.map((r) => [
      r.unit_name,
      r.received_count,
      r.closed_count,
      r.avg_days ?? "-",
      r.min_days ?? "-",
      r.max_days ?? "-",
      r.open_count,
      r.act_done,
      r.act_avg_days ?? "-",
      r.act_late,
    ]),
    footer: rows.length > 1
      ? [
          "รวมทุกหน่วย",
          rows.reduce((n, r) => n + r.received_count, 0),
          closed,
          weighted((r) => [r.avg_days, r.closed_count], closed),
          "",
          "",
          rows.reduce((n, r) => n + r.open_count, 0),
          acts,
          weighted((r) => [r.act_avg_days, r.act_done], acts),
          rows.reduce((n, r) => n + r.act_late, 0),
        ]
      : undefined,
  };
}

export async function buildDocsReport(kind: DocReportKind, s: DocReportScope): Promise<ReportTable> {
  if (kind === "pending") return pendingReport(s);
  if (kind === "duration") return durationReport(s);
  return registerReport(s);
}
