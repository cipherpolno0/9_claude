"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import type { ImportPreviewResult, ImportPreviewRow } from "@/components/import-dialog";
import { requireMenu } from "@/lib/auth/guards";
import { explainError, type ActionResult } from "@/lib/errors";
import { readUploadedSheet } from "@/lib/excel";
import { isExamType, type SignatureSlot } from "@/lib/exam-forms";
import { signaturesProblem } from "@/lib/exam-lists";
import {
  HISTORY_IMPORT_HEADERS,
  RESULT_IMPORT_HEADERS,
  RESULT_IMPORT_MAX_ROWS,
  RESULTS_TAG,
  SUBJECTS,
  normalizeText,
  parseExamTypeText,
  parseLevelText,
  parseScore,
  resultRowFromCells,
} from "@/lib/exam-results";
import { isUuid } from "@/lib/exam-results-server";
import { parseDateText } from "@/lib/exam-upload";
import { createClient } from "@/lib/supabase/server";

const ROOT = "/app/exams/results";

function refresh() {
  revalidatePath(ROOT, "layout");
  revalidatePath("/exams/results");
  revalidatePath("/exams/result-stats");
  revalidateTag(RESULTS_TAG, { expire: 0 });
}

type RawRows = { rowNumber: number; cells: string[] }[];

const cleanRaw = (raw: unknown): RawRows =>
  (Array.isArray(raw) ? raw : []).slice(0, RESULT_IMPORT_MAX_ROWS + 1).map((r) => ({
    rowNumber: Number((r as { rowNumber?: unknown })?.rowNumber) || 0,
    cells: Array.isArray((r as { cells?: unknown })?.cells) ? ((r as { cells: unknown[] }).cells.map((c) => String(c ?? "").slice(0, 300))) : [],
  }));

const STATUS_MAP: Record<string, ImportPreviewRow["status"]> = { new: "new", update: "new", same: "skip", empty: "skip", error: "error" };

// ---------------------------------------------------------------
// นำเข้าผลสอบ (ส่วนกลาง) ใช้กล่องนำเข้ากลาง: อ่านไฟล์ > ฐานข้อมูลตรวจและจับคู่ > ยืนยัน (ฐานข้อมูลตรวจซ้ำ)
// ---------------------------------------------------------------
async function evalResultRows(roundId: string, raw: RawRows) {
  const rows = raw.map((r) => resultRowFromCells(r.rowNumber, r.cells));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_exam_results_import", { p_round: roundId, p_rows: rows });
  if (error) return { ok: false as const, error: explainError(error) };
  const checked = (data as { row_no: number; status: string; message: string; full_name: string; place_name: string }[]) ?? [];
  return { ok: true as const, rows, checked };
}

export async function previewResultImport(roundId: string, formData: FormData): Promise<ImportPreviewResult<RawRows>> {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds || !isUuid(roundId)) return { ok: false, error: "นำเข้าผลสอบได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ" };
  const sheet = await readUploadedSheet(formData, RESULT_IMPORT_HEADERS, RESULT_IMPORT_MAX_ROWS);
  if (!sheet.ok) return sheet;
  const ev = await evalResultRows(roundId, sheet.rows);
  if (!ev.ok) return ev;
  const byRow = new Map(ev.checked.map((c) => [c.row_no, c]));
  return {
    ok: true,
    payload: sheet.rows,
    rows: ev.rows.map((r) => {
      const c = byRow.get(r.row_no);
      const status = STATUS_MAP[c?.status ?? "error"] ?? "error";
      return {
        rowNumber: r.row_no,
        cells: [r.code, c?.full_name || "-", c?.place_name || "-", sheet.rows.find((x) => x.rowNumber === r.row_no)?.cells[4] ?? "", r.certificate_no],
        status,
        message: c?.message ?? "ไม่พบผลตรวจ",
      };
    }),
  };
}

export async function confirmResultImport(roundId: string, raw: RawRows): Promise<ActionResult> {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds || !isUuid(roundId)) return { ok: false, error: "นำเข้าผลสอบได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ" };
  const clean = cleanRaw(raw);
  if (clean.length === 0 || clean.length > RESULT_IMPORT_MAX_ROWS) return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
  const rows = clean.map((r) => resultRowFromCells(r.rowNumber, r.cells));
  const supabase = await createClient();
  // ฐานข้อมูลตรวจซ้ำทุกแถวเอง (ไม่เชื่อผลตรวจจากหน้าจอ) มีแถวผิดแถวเดียว = ไม่บันทึกทั้งชุด
  const { data, error } = await supabase.rpc("import_exam_results", { p_round: roundId, p_rows: rows });
  if (error) return { ok: false, error: explainError(error) };
  const n = data as { new: number; updated: number; same: number; empty: number };
  refresh();
  return {
    ok: true,
    message: `นำเข้าแล้ว: เพิ่มใหม่ ${n.new.toLocaleString("th-TH")} คน แก้ผลเดิม ${n.updated.toLocaleString("th-TH")} คน (ไม่เปลี่ยน ${n.same.toLocaleString("th-TH")} ยังไม่กรอกผล ${n.empty.toLocaleString("th-TH")})`,
  };
}

// ---------------------------------------------------------------
// ประกาศผล
// ---------------------------------------------------------------
export async function publishResults(roundId: string, announcedOn: string, allowMissing: boolean): Promise<ActionResult> {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds || !isUuid(roundId)) return { ok: false, error: "ประกาศผลได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(announcedOn ?? "")) return { ok: false, error: "กรุณาเลือกวันที่ประกาศผล" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_exam_results", {
    p_round: roundId,
    p_announced_on: announcedOn,
    p_allow_missing: allowMissing === true,
  });
  if (error) return { ok: false, error: explainError(error) };
  const n = data as { results: number; missing: number };
  refresh();
  return {
    ok: true,
    message: `ประกาศผลแล้ว ${n.results.toLocaleString("th-TH")} คน${n.missing ? ` (ยังไม่มีผล ${n.missing.toLocaleString("th-TH")} คน)` : ""} หน้าสาธารณะแสดงผลแล้ว`,
  };
}

// ---------------------------------------------------------------
// แก้ผลรายคน (ส่วนกลาง) หลังประกาศต้องมีเหตุผล
// ---------------------------------------------------------------
export async function saveResult(candidateId: string, input: {
  result: string;
  scores: Record<string, string>;
  certificate_no: string;
  note: string;
  reason: string;
}): Promise<ActionResult> {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds || !isUuid(candidateId)) return { ok: false, error: "แก้ผลสอบได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ" };
  const scores = Object.fromEntries(SUBJECTS.map((s) => [s.key, parseScore(String(input?.scores?.[s.key] ?? ""))]));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_exam_result", {
    p_candidate: candidateId,
    p_result: String(input?.result ?? ""),
    p_scores: scores,
    p_certificate_no: normalizeText(String(input?.certificate_no ?? "")).slice(0, 60),
    p_note: normalizeText(String(input?.note ?? "")).slice(0, 250),
    p_reason: String(input?.reason ?? "").trim().slice(0, 600),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: (data as { changed?: boolean })?.changed ? "บันทึกผลสอบแล้ว" : "ไม่มีการเปลี่ยนแปลง" };
}

// ---------------------------------------------------------------
// ผลสอบได้ย้อนหลัง (ส่วนกลาง)
// ---------------------------------------------------------------
function historyRow(rowNumber: number, cells: string[]) {
  const birthText = normalizeText(cells[5] ?? "");
  // ช่องวันที่ของ Excel อ่านได้เป็น ISO (ปีเกิน 2400 = พิมพ์เป็น พ.ศ.)
  const iso = birthText.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  const birth = iso
    ? `${Number(iso[1]) > 2400 ? Number(iso[1]) - 543 : iso[1]}-${iso[2]}-${iso[3]}`
    : birthText
      ? (parseDateText(birthText) ?? birthText.slice(0, 30))
      : "";
  return {
    row_no: rowNumber,
    national_id: normalizeText(cells[0] ?? "").replace(/[\s-]/g, "").slice(0, 30),
    title: normalizeText(cells[1] ?? "").slice(0, 80),
    first_name: normalizeText(cells[2] ?? "").slice(0, 120),
    monastic_name: normalizeText(cells[3] ?? "").slice(0, 120),
    last_name: normalizeText(cells[4] ?? "").slice(0, 120),
    birth_date: birth,
    exam_type: parseExamTypeText(cells[6] ?? ""),
    level: parseLevelText(cells[7] ?? ""),
    year_be: normalizeText(cells[8] ?? "").slice(0, 10),
    certificate_no: normalizeText(cells[9] ?? "").slice(0, 60),
    place_name: normalizeText(cells[10] ?? "").slice(0, 220),
    note: normalizeText(cells[11] ?? "").slice(0, 220),
  };
}

export async function previewHistoryImport(formData: FormData): Promise<ImportPreviewResult<RawRows>> {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) return { ok: false, error: "นำเข้าผลย้อนหลังได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ" };
  const sheet = await readUploadedSheet(formData, HISTORY_IMPORT_HEADERS, RESULT_IMPORT_MAX_ROWS);
  if (!sheet.ok) return sheet;
  const rows = sheet.rows.map((r) => historyRow(r.rowNumber, r.cells));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_pass_history_import", { p_rows: rows });
  if (error) return { ok: false, error: explainError(error) };
  const byRow = new Map(((data as { row_no: number; status: string; message: string }[]) ?? []).map((c) => [c.row_no, c]));
  return {
    ok: true,
    payload: sheet.rows,
    rows: rows.map((r) => {
      const c = byRow.get(r.row_no);
      // เลขประจำตัวในตารางตัวอย่างแสดงเฉพาะ 4 ตัวท้าย
      const masked = r.national_id ? `*********${r.national_id.slice(-4)}` : "-";
      return {
        rowNumber: r.row_no,
        cells: [masked, [r.title, r.first_name, r.monastic_name, r.last_name].filter(Boolean).join(" "), sheetCell(sheet.rows, r.row_no, 6), sheetCell(sheet.rows, r.row_no, 7), r.year_be],
        status: (c?.status === "new" ? "new" : c?.status === "skip" ? "skip" : "error") as ImportPreviewRow["status"],
        message: c?.message ?? "ไม่พบผลตรวจ",
      };
    }),
  };
}

const sheetCell = (rows: RawRows, rowNumber: number, i: number) => rows.find((x) => x.rowNumber === rowNumber)?.cells[i] ?? "";

export async function confirmHistoryImport(raw: RawRows): Promise<ActionResult> {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) return { ok: false, error: "นำเข้าผลย้อนหลังได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ" };
  const clean = cleanRaw(raw);
  if (clean.length === 0 || clean.length > RESULT_IMPORT_MAX_ROWS) return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_pass_history", { p_rows: clean.map((r) => historyRow(r.rowNumber, r.cells)) });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath(`${ROOT}/history`);
  return { ok: true, message: `นำเข้าผลสอบได้ย้อนหลังแล้ว ${Number(data).toLocaleString("th-TH")} รายการ` };
}

export async function setHistoryActive(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds || !isUuid(id)) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pass_history_active", { p_id: id, p_active: active === true });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath(`${ROOT}/history`);
  return { ok: true, message: active ? "นำกลับมาใช้แล้ว" : "ปิดใช้งานแล้ว (ไม่ใช้เป็นหลักฐานคุณสมบัติ)" };
}

// ---------------------------------------------------------------
// แบบบัญชีผู้สอบได้ ศ.๔ ศ.๘ (ผู้ดูแลระบบ: RLS ยอมให้เฉพาะผู้ดูแลระบบแก้)
// ---------------------------------------------------------------
export async function saveResultForm(examType: string, input: { code: string; certify_text: string; signatures: SignatureSlot[] }): Promise<ActionResult> {
  if (!isExamType(examType)) return { ok: false, error: "ไม่รู้จักประเภทการสอบนี้" };
  const code = String(input?.code ?? "").trim();
  const certify = String(input?.certify_text ?? "").trim();
  const signatures = (Array.isArray(input?.signatures) ? input.signatures : [])
    .map((x) => ({ text: String(x?.text ?? "").slice(0, 400).replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "") }))
    .filter((x) => x.text.trim() !== "");
  if (!code || code.length > 20) return { ok: false, error: "กรุณากรอกรหัสแบบ (ไม่เกิน 20 ตัวอักษร)" };
  if (certify.length > 200) return { ok: false, error: "ข้อความรับรองยาวเกิน 200 ตัวอักษร" };
  const problem = signaturesProblem(signatures);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exam_result_forms")
    .update({ code, certify_text: certify, signatures })
    .eq("exam_type", examType)
    .select("exam_type");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขแบบบัญชีผู้สอบได้" };
  revalidatePath("/app/admin/form-templates");
  revalidatePath(`${ROOT}/lists`, "layout");
  return { ok: true, message: "บันทึกแบบบัญชีผู้สอบได้แล้ว" };
}
