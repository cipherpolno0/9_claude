import { parseTableParams, xlsxResponse } from "@/lib/data-table";
import { currentYearBe, DOC_CLASS_LABEL, DOC_KIND_LABEL, DOC_STATUS_LABEL, DOC_URGENCY_LABEL, isDocTab, type DocTab } from "@/lib/docs";
import { fetchDocumentYears, queryDocuments } from "@/lib/docs-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

import { loadDocsScope } from "../scope";

export const dynamic = "force-dynamic";

/** ส่งออกทะเบียนหนังสือรับหรือส่งของหน่วยตามเงื่อนไขบนหน้า (หนังสือลับที่ไม่มีสิทธิ์เห็น ส่งออกเพียงเลขและวันที่) */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const search = Object.fromEntries(sp.entries());
  const { ctx, unit } = await loadDocsScope(search);
  if (!ctx.canViewDocs || !unit) return new Response("ไม่มีสิทธิ์", { status: 403 });
  const tab: DocTab = isDocTab(sp.get("tab")) && sp.get("tab") !== "draft" ? (sp.get("tab") as DocTab) : "receive";
  const years = await fetchDocumentYears(unit.id);
  const year = years.includes(Number(sp.get("year"))) ? Number(sp.get("year")) : currentYearBe();
  const params = parseTableParams(sp, {
    sortable: ["no", "date", "subject"],
    defaultSort: "no",
    defaultDir: "asc",
    filters: ["kind", "urgency", "status"],
    pageSize: 5000,
  });
  const { rows } = await queryDocuments(unit.id, tab, year, { ...params, from: 0, to: 4999 });
  const hidden = "(หนังสือลับ)";
  if (tab === "receive") {
    return xlsxResponse(
      `ทะเบียนหนังสือรับ-${year}.xlsx`,
      "ทะเบียนรับ",
      [
        { header: "เลขทะเบียนรับ", width: 12 },
        { header: "ที่", width: 22 },
        { header: "ลงวันที่", width: 16 },
        { header: "จาก", width: 30 },
        { header: "ถึง", width: 24 },
        { header: "เรื่อง", width: 50 },
        { header: "ชนิด", width: 16 },
        { header: "ชั้นความเร็ว", width: 12 },
        { header: "ชั้นความลับ", width: 12 },
        { header: "วันเวลารับ", width: 22 },
        { header: "สถานะ", width: 12 },
      ],
      rows.map((r) => [
        r.seq_no,
        r.doc_no,
        thaiDate(r.doc_date, "short"),
        r.masked ? hidden : r.from_text,
        r.masked ? "" : r.to_text,
        r.masked ? hidden : r.subject,
        DOC_KIND_LABEL[r.kind],
        DOC_URGENCY_LABEL[r.urgency],
        r.classification === "normal" ? "" : DOC_CLASS_LABEL[r.classification],
        thaiDateTime(r.received_at),
        DOC_STATUS_LABEL[r.status],
      ]),
    );
  }
  return xlsxResponse(
    `ทะเบียนหนังสือส่ง-${year}.xlsx`,
    "ทะเบียนส่ง",
    [
      { header: "เลขที่", width: 22 },
      { header: "ลงวันที่", width: 16 },
      { header: "ถึง", width: 30 },
      { header: "เรื่อง", width: 50 },
      { header: "ชนิด", width: 16 },
      { header: "ชั้นความเร็ว", width: 12 },
      { header: "ชั้นความลับ", width: 12 },
      { header: "สถานะ", width: 12 },
    ],
    rows.map((r) => [
      r.doc_no,
      thaiDate(r.doc_date, "short"),
      r.masked ? hidden : r.to_text,
      r.masked ? hidden : r.subject,
      DOC_KIND_LABEL[r.kind],
      DOC_URGENCY_LABEL[r.urgency],
      r.classification === "normal" ? "" : DOC_CLASS_LABEL[r.classification],
      DOC_STATUS_LABEL[r.status],
    ]),
  );
}
