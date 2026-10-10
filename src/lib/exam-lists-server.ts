import "server-only";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import { explainError } from "@/lib/errors";
import { BATCH_STATUS_LABEL } from "@/lib/exam-batches";
import { EXAM_LEVELS, EXAM_TYPES, examName, type ExamLevel, type ExamType } from "@/lib/exam-forms";
import { fetchFormTemplates } from "@/lib/exam-forms-server";
import {
  LIST_REPORT_LABEL,
  checkPublicQuery,
  formParam,
  type DuplicateRow,
  type ListForm,
  type ListOption,
  type ListReportKind,
  type ListRow,
  type PersonRow,
  type PublicCheckResult,
  type PublicCheckRow,
  type ReportCountRow,
} from "@/lib/exam-lists";
import type { ReportTable } from "@/lib/reports";
import { createAdminClient, getSupabaseEnv } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toBuddhistDateText } from "@/lib/thai";

const UUID = /^[0-9a-f-]{36}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** แบบ ศ. ที่ใช้งานอยู่ เรียง ศ.๑ ศ.๒ ศ.๕ ศ.๖ (ตามลำดับที่ตั้งไว้) */
export async function fetchListForms(): Promise<ListForm[]> {
  const all = await fetchFormTemplates();
  return all
    .filter((t) => t.is_active !== false)
    .map((t) => ({
      id: t.id,
      code: t.code,
      exam_type: t.exam_type,
      level: t.level,
      title: t.title,
      header_cells: t.header_cells,
      columns: t.columns,
      signatures: t.signatures ?? [],
    }));
}

export const findForm = (forms: ListForm[], param: string | undefined) => forms.find((f) => formParam(f) === param) ?? null;

export async function fetchListOptions(year: number, form: ListForm, unitId: string | null): Promise<ListOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("registration_list_options", {
    p_year: year,
    p_exam_type: form.exam_type,
    p_level: form.level,
    p_unit: unitId,
  });
  return (data as ListOption[] | null) ?? [];
}

export async function fetchList(
  year: number,
  form: ListForm,
  unitId: string | null,
  placeId: string | null,
  venueId: string | null,
): Promise<ListRow[]> {
  if (!placeId && !venueId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registration_list", {
    p_year: year,
    p_exam_type: form.exam_type,
    p_level: form.level,
    p_unit: unitId,
    p_place: placeId,
    p_venue: venueId,
  });
  if (error) throw new Error(explainError(error));
  return (data as ListRow[] | null) ?? [];
}

/** ตรวจสอบรายบุคคล (ในนามผู้ใช้ ฐานข้อมูลกรองด้วย can_view_registration) */
export async function searchPeople(q: string, nid: string): Promise<{ ok: true; rows: PersonRow[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registration_person_search", { p_q: q, p_nid: nid });
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true, rows: (data as PersonRow[] | null) ?? [] };
}

export async function fetchReportCounts(year: number, unitId: string): Promise<ReportCountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registration_report_counts", { p_year: year, p_unit: unitId });
  if (error) throw new Error(explainError(error));
  return (data as ReportCountRow[] | null) ?? [];
}

export async function fetchDuplicates(year: number, unitId: string): Promise<DuplicateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registration_report_duplicates", { p_year: year, p_unit: unitId });
  if (error) throw new Error(explainError(error));
  return (data as DuplicateRow[] | null) ?? [];
}

const FORM_KEYS: { type: ExamType; level: ExamLevel }[] = EXAM_TYPES.flatMap((type) => EXAM_LEVELS.map((level) => ({ type, level })));

/** รายงานสรุปในรูปตารางกลาง (ReportTable) ใช้ทั้งบนจอ Excel และหน้าพิมพ์ */
export async function buildListReport(kind: ListReportKind, year: number, unit: { id: string; name: string }): Promise<ReportTable> {
  if (kind === "counts") {
    const rows = await fetchReportCounts(year, unit.id);
    const used = FORM_KEYS.filter((k) => rows.some((r) => r.exam_type === k.type && r.level === k.level));
    const code = (k: { type: ExamType; level: ExamLevel }) =>
      rows.find((r) => r.exam_type === k.type && r.level === k.level)?.form_code ?? "";
    const units = new Map<string, { name: string; self: boolean; values: Map<string, number>; accounts: number }>();
    for (const r of rows) {
      const u = units.get(r.unit_id) ?? { name: r.unit_name, self: r.is_self, values: new Map(), accounts: 0 };
      u.values.set(`${r.exam_type}-${r.level}`, r.candidates);
      u.accounts += r.accounts;
      units.set(r.unit_id, u);
    }
    const body = [...units.values()].map((u) => {
      const values = used.map((k) => u.values.get(`${k.type}-${k.level}`) ?? 0);
      return [u.self ? `${u.name} (บัญชีของหน่วยนี้เอง)` : u.name, ...values, values.reduce((s, v) => s + v, 0), u.accounts];
    });
    const totals = used.map((_, i) => body.reduce((s, r) => s + Number(r[i + 1]), 0));
    return {
      kind: "exam-list-counts",
      title: `${LIST_REPORT_LABEL.counts} ปี ${year}`,
      subtitle: `${unit.name} · นับผู้สมัครในบัญชีที่ส่งแล้ว รวมที่อยู่ระหว่างรับรอง`,
      note: "แบ่งตามเขตใต้สังกัดชั้นถัดไปของเขตที่เลือก (นับรวมหน่วยใต้สังกัดทั้งหมด) เฉพาะบัญชีที่ท่านมีสิทธิ์เห็น",
      columns: [
        { header: "เขต", width: 36 },
        ...used.map((k) => ({ header: `${code(k)} ${examName(k.type, k.level)}`, width: 18, align: "right" as const })),
        { header: "รวม (คน)", width: 12, align: "right" as const },
        { header: "จำนวนบัญชี", width: 12, align: "right" as const },
      ],
      rows: body,
      footer: body.length
        ? ["รวมทั้งหมด", ...totals, totals.reduce((s, v) => s + v, 0), body.reduce((s, r) => s + Number(r[r.length - 1]), 0)]
        : undefined,
    };
  }

  const rows = await fetchDuplicates(year, unit.id);
  const people = new Set(rows.map((r) => r.person_ref)).size;
  // ป้ายกลุ่มใช้แถวแรกของบุคคล (คำนำหน้าอาจต่างกันในแต่ละแบบ เช่น สามเณร / นาย)
  const firstOf = new Map<string, DuplicateRow>();
  for (const r of rows) if (!firstOf.has(r.person_ref)) firstOf.set(r.person_ref, r);
  const who = (row: DuplicateRow) => {
    const r = firstOf.get(row.person_ref) ?? row;
    const name = [r.first_name, r.monastic_name, r.last_name].filter((s) => s?.trim()).join(" ");
    const hint = r.national_id_last4 ? `เลขประจำตัวลงท้าย ${r.national_id_last4}` : `เกิด ${toBuddhistDateText(r.birth_date)}`;
    return `${name} (${hint})`;
  };
  return {
    kind: "exam-list-duplicates",
    title: `${LIST_REPORT_LABEL.duplicates} ปี ${year}`,
    subtitle: `${unit.name} · ${people.toLocaleString("th-TH")} คน`,
    note:
      "บุคคลเดียวกัน = เลขประจำตัวเดียวกัน หรือ (ไม่มีเลข) ชื่อ นามสกุล และวันเกิดตรงกัน นับบัญชีที่ยืนยันหรือส่งแล้วทุกชั้นในปีเดียวกัน " +
      "รายการในเขตที่ท่านไม่มีสิทธิ์เห็นไม่แสดงรายละเอียด",
    columns: [
      { header: "ผู้สมัคร: ", width: 40 },
      { header: "ชั้นที่สมัคร", width: 24 },
      { header: "รหัสผู้สมัคร", width: 18 },
      { header: "สำนัก", width: 28 },
      { header: "สนามสอบ", width: 28 },
      { header: "เขต", width: 24 },
      { header: "สถานะบัญชี", width: 14 },
      { header: "หมายเหตุ", width: 24 },
    ],
    groupColumn: 0,
    rows: rows.map((r) => [
      who(r),
      `${r.form_code} ${examName(r.exam_type, r.level)}`,
      r.candidate_code ?? "",
      r.place_name,
      r.venue_name,
      r.unit_name,
      BATCH_STATUS_LABEL[r.batch_status] ?? r.batch_status,
      r.hidden_count > 0 ? `มีอีก ${r.hidden_count} รายการในเขตที่ท่านไม่มีสิทธิ์เห็น` : "",
    ]),
  };
}

// ---------------------------------------------------------------
// ตรวจรายชื่อผู้ขอเข้าสอบ (สาธารณะ)
// ---------------------------------------------------------------

/** รหัสเครื่องผู้ค้น: ที่อยู่ IP เข้ารหัสทางเดียวด้วยกุญแจลับของเว็บ (ฐานข้อมูลไม่เห็นที่อยู่จริง) */
async function clientHash(secret: string): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "unknown";
  return createHmac("sha256", secret).update(`public-check|${ip}`).digest("hex");
}

/**
 * ค้นรายชื่อผู้ขอเข้าสอบ เหตุผลที่ใช้ createAdminClient (กุญแจลับ):
 * ฟังก์ชัน public_registration_search นับจำนวนครั้งต่อนาทีต่อเครื่องในฐานข้อมูล ถ้าเปิดให้ anon เรียกตรง
 * ผู้เรียก API โดยตรงจะส่งรหัสเครื่องปลอมเลี่ยงการจำกัดได้ จึงให้เฉพาะเซิร์ฟเวอร์ของเว็บเรียก (service_role)
 * และส่งรหัสเครื่องที่เซิร์ฟเวอร์คำนวณเองจากที่อยู่ IP ของคำขอ
 */
export async function searchPublicRegistration(input: { first: string; last: string; year: string }): Promise<PublicCheckResult> {
  const q = checkPublicQuery(input);
  if (!q.ok) return q;
  const { secretKey, missing } = getSupabaseEnv();
  if (missing.length) return { ok: false, error: "ระบบค้นหายังไม่พร้อมใช้งาน" };
  const { data, error } = await createAdminClient().rpc("public_registration_search", {
    p_first: q.first,
    p_last: q.last,
    p_year: q.year,
    p_client: await clientHash(secretKey),
  });
  if (error) return { ok: false, error: explainError(error) };
  const value = (data ?? {}) as { limited?: boolean; total?: number; rows?: PublicCheckRow[] };
  if (value.limited) {
    return { ok: false, limited: true, error: "ค้นบ่อยเกินไป (เกิน 10 ครั้งต่อนาที) กรุณารอสักครู่แล้วค้นใหม่" };
  }
  return { ok: true, total: value.total ?? 0, rows: value.rows ?? [] };
}
