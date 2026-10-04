import "server-only";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import { TRACKS, TRACK_LABEL, type Track } from "@/lib/education";
import { LEVEL_LABEL, SECT_LABEL, type OrgLevel, type Sect } from "@/lib/org-units";
import { PERSON_STATUSES, personName, personStatusLabel, todayIso, type PersonType } from "@/lib/persons";
import { isUuid } from "@/lib/persons-server";
import {
  fiscalYearOf,
  fiscalYearRange,
  type GovernanceSlot,
  type ReportKind,
  type ReportTable,
  type ViewRoot,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { thaiDate, toBuddhistDateText } from "@/lib/thai";

// ------------------------------------------------------------------
// เขตที่เลือกดู (ผังและรายงานใช้ร่วมกัน)
// ------------------------------------------------------------------

/** หน่วยบนสุดที่ผู้ใช้ดูทะเบียนบุคคลได้ (เห็นทุกเขต = รายชื่อภาค) */
export async function fetchViewRoots(): Promise<ViewRoot[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("personnel_view_roots");
  return (data as ViewRoot[] | null) ?? [];
}

export type ChosenUnit = { id: string; name: string; code: string; level: OrgLevel; sect: Sect | null };

/** เขตที่เลือกจากที่อยู่หน้าเว็บ (?unit=) ถ้าไม่ได้เลือก ใช้หน่วยบนสุดหน่วยแรกที่ดูได้ */
export async function resolveUnit(raw: string | undefined, roots: ViewRoot[]): Promise<ChosenUnit | null> {
  const id = raw && isUuid(raw) ? raw : roots[0]?.id;
  if (!id) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("org_units").select("id, name, code, level, sect").eq("id", id).maybeSingle();
  return (data as ChosenUnit | null) ?? null;
}

export async function fetchSlots(unitId: string): Promise<GovernanceSlot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("governance_slots", { p_unit: unitId });
  if (error) throw error;
  return (data as GovernanceSlot[] | null) ?? [];
}

// ------------------------------------------------------------------
// หน้าตรวจสอบ
// ------------------------------------------------------------------

export type LookupRow = {
  id: string;
  person_type: PersonType;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  temple_name: string;
  org_unit_name: string;
  org_unit_code: string;
  status: string;
  positions: string | null;
  education: string | null;
  total_count: number;
};

export function lookupTableParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["name", "unit", "status"],
    defaultSort: "name",
    filters: ["unit", "position", "track", "status"],
    pageSize: 10,
  });
}

export async function queryLookup(params: TableParams) {
  const supabase = await createClient();
  const { unit, position, track, status } = params.filters;
  const { data, error } = await supabase.rpc("lookup_personnel", {
    p_q: params.q,
    p_unit: isUuid(unit ?? "") ? unit : null,
    p_position: /^[a-z_]+$/.test(position ?? "") ? position : null,
    p_track: (TRACKS as readonly string[]).includes(track) ? track : null,
    p_status: (PERSON_STATUSES as readonly string[]).includes(status) ? status : null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.from,
  });
  const rows = (data as LookupRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

/** บรรทัดของ จศป. จากฟังก์ชัน lookup_personnel (รูปแบบ "แท่ง|ตำแหน่ง · สำนัก") แปลงเป็นข้อความแสดงผล */
export function educationLines(text: string | null): string[] {
  if (!text) return [];
  return text.split("\n").map((line) => {
    const [track, rest] = line.split("|");
    return `${TRACK_LABEL[track as Track] ?? track}: ${rest ?? ""}`;
  });
}

// ------------------------------------------------------------------
// แดชบอร์ดบุคลากร
// ------------------------------------------------------------------

export type PersonnelCount = { grp: "position" | "track"; key: string; label: string; sort_order: number; total: number };

export async function fetchPersonnelCounts(): Promise<PersonnelCount[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("personnel_counts");
  return ((data as PersonnelCount[] | null) ?? []).map((c) =>
    c.grp === "track" ? { ...c, label: TRACK_LABEL[c.key as Track] ?? c.key } : c,
  );
}

/** จำนวนคำขอและการแจ้งของทะเบียนบุคคลที่ยังรอพิจารณา (เท่าที่ผู้ใช้มีสิทธิ์เห็น) */
export async function countPendingPersonnelRequests(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_personnel_requests", { p_status: "pending", p_limit: 1, p_offset: 0 });
  return Number((data as { total_count: number }[] | null)?.[0]?.total_count ?? 0);
}

// ------------------------------------------------------------------
// รายงาน (ตารางกลาง ใช้ทั้งบนจอ Excel และหน้าพิมพ์)
// ------------------------------------------------------------------

type DirectoryRow = {
  unit_code: string;
  unit_name: string;
  unit_level: OrgLevel;
  sect: Sect | null;
  position_name: string;
  person_id: string;
  person_type: PersonType;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  temple_name: string;
  appointed_on: string;
  order_no: string;
  status: string;
};

type EducationRow = {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  unit_level: OrgLevel;
  dhamma: number;
  pali: number;
  general: number;
  supervisor: number;
  persons: number;
};

export type StatusSummaryRow = {
  fiscal_year: number;
  unit_id: string;
  unit_code: string;
  unit_name: string;
  transfer: number;
  resign: number;
  death: number;
  disrobe: number;
  other: number;
};

export async function fetchStatusSummary(unitId: string): Promise<StatusSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_status_summary", { p_unit: unitId });
  if (error) throw error;
  return (data as StatusSummaryRow[] | null) ?? [];
}

const STATUS_KEYS = ["transfer", "resign", "death", "disrobe", "other"] as const;
const STATUS_HEADERS = ["ย้าย", "ลาออก", "มรณภาพ-ตาย", "ลาสิกขา", "เหตุอื่น"];

/**
 * สร้างตารางรายงานของเขตที่เลือก (รวมหน่วยใต้สังกัด เท่าที่ผู้ใช้มีสิทธิ์ดู)
 * fiscalYear ใช้กับรายงาน status: ไม่ระบุ = สรุปทุกปี / ระบุ = แยกตามเขตของปีนั้น
 */
export async function buildReport(kind: ReportKind, unit: ChosenUnit, fiscalYear: number | null): Promise<ReportTable> {
  const supabase = await createClient();
  const asOf = `ข้อมูล ณ วันที่ ${thaiDate(new Date())}`;
  const scope = `${unit.name} และหน่วยใต้สังกัด`;

  if (kind === "directory") {
    const { data, error } = await supabase.rpc("report_directory", { p_unit: unit.id });
    if (error) throw error;
    const rows = (data as DirectoryRow[] | null) ?? [];
    return {
      kind,
      title: "ทำเนียบผู้ดำรงตำแหน่งปกครอง",
      subtitle: `${scope} · ${asOf}`,
      columns: [
        { header: "เขตปกครอง", width: 34 },
        { header: "ระดับ", width: 12 },
        { header: "ตำแหน่ง", width: 28 },
        { header: "ชื่อ", width: 36 },
        { header: "วัดที่สังกัด", width: 26 },
        { header: "วันที่ได้รับแต่งตั้ง", width: 18 },
        { header: "เลขที่คำสั่ง", width: 18 },
        { header: "สถานะ", width: 18 },
      ],
      rows: rows.map((r) => [
        r.unit_name,
        LEVEL_LABEL[r.unit_level],
        r.position_name,
        personName(r),
        r.temple_name,
        toBuddhistDateText(r.appointed_on),
        r.order_no,
        personStatusLabel(r.status, r.person_type),
      ]),
    };
  }

  if (kind === "vacancies") {
    const slots = (await fetchSlots(unit.id)).filter((s) => s.missing > 0);
    return {
      kind,
      title: "รายงานตำแหน่งว่าง",
      subtitle: `${scope} · ${asOf}`,
      note: "ว่าง = เจ้าคณะไม่มีผู้ดำรงตำแหน่ง / รองเจ้าคณะและเลขานุการ ไม่มีผู้ดำรงตำแหน่ง หรือมีน้อยกว่าจำนวนที่ตั้งไว้",
      columns: [
        { header: "เขตปกครอง", width: 34 },
        { header: "ระดับ", width: 12 },
        { header: "ตำแหน่ง", width: 28 },
        { header: "จำนวนที่ตั้งไว้", width: 16, align: "center" },
        { header: "มีผู้ดำรง", width: 12, align: "center" },
        { header: "ว่าง", width: 10, align: "center" },
      ],
      rows: slots.map((s) => [
        s.unit_name,
        LEVEL_LABEL[s.unit_level as OrgLevel],
        s.position_name,
        s.max_per_unit === null ? "ไม่จำกัด" : s.max_per_unit,
        s.held,
        s.missing,
      ]),
      footer: ["รวม", "", "", "", "", slots.reduce((sum, s) => sum + s.missing, 0)],
    };
  }

  if (kind === "education") {
    const { data, error } = await supabase.rpc("report_education_staff", { p_unit: unit.id });
    if (error) throw error;
    const rows = (data as EducationRow[] | null) ?? [];
    return {
      kind,
      title: "จำนวน จศป. แยกแท่งและเขต",
      subtitle: `${scope} · ${asOf}`,
      note: "นับผู้ที่ปฏิบัติหน้าที่อยู่ ตัวเลขของแต่ละเขตรวมหน่วยใต้สังกัดแล้ว ผู้ที่อยู่หลายแท่งนับในทุกแท่ง ช่องสุดท้ายนับเป็นรายบุคคล",
      columns: [
        { header: "เขตปกครอง", width: 34 },
        { header: "ระดับ", width: 12 },
        ...TRACKS.map((t) => ({ header: TRACK_LABEL[t], width: 14, align: "center" as const })),
        { header: "รวม (รูป/คน)", width: 14, align: "center" },
      ],
      rows: rows.map((r) => [
        r.unit_name,
        LEVEL_LABEL[r.unit_level],
        r.dhamma,
        r.pali,
        r.general,
        r.supervisor,
        r.persons,
      ]),
    };
  }

  // status: สรุปรายปีงบประมาณ
  const summary = await fetchStatusSummary(unit.id);
  const sumOf = (rows: StatusSummaryRow[]) => STATUS_KEYS.map((k) => rows.reduce((s, r) => s + r[k], 0));
  const numberCols = [...STATUS_HEADERS, "รวม"].map((h) => ({ header: h, width: 14, align: "center" as const }));

  if (fiscalYear !== null) {
    const rows = summary.filter((r) => r.fiscal_year === fiscalYear);
    const totals = sumOf(rows);
    return {
      kind,
      title: `สรุปการเปลี่ยนสถานะ ปีงบประมาณ ${fiscalYear}`,
      subtitle: `${scope} · ${fiscalYearRange(fiscalYear)}`,
      note: "นับตามวันที่มีผล ที่หน่วยต้นสังกัดขณะเปลี่ยนสถานะ (การย้ายนับที่หน่วยต้นทาง)",
      columns: [{ header: "เขตปกครอง", width: 34 }, ...numberCols],
      rows: rows.map((r) => {
        const values = STATUS_KEYS.map((k) => r[k]);
        return [r.unit_name, ...values, values.reduce((a, b) => a + b, 0)];
      }),
      footer: ["รวม", ...totals, totals.reduce((a, b) => a + b, 0)],
    };
  }

  const years = [...new Set([fiscalYearOf(todayIso()), ...summary.map((r) => r.fiscal_year)])].sort((a, b) => b - a);
  return {
    kind,
    title: "สรุปการเปลี่ยนสถานะรายปีงบประมาณ",
    subtitle: `${scope} · ${asOf}`,
    note: "ปีงบประมาณเริ่ม 1 ตุลาคม ถึง 30 กันยายน ของปีถัดไป นับตามวันที่มีผล",
    columns: [{ header: "ปีงบประมาณ", width: 14, align: "center" }, { header: "ช่วงเวลา", width: 30 }, ...numberCols],
    rows: years.map((y) => {
      const totals = sumOf(summary.filter((r) => r.fiscal_year === y));
      return [y, fiscalYearRange(y), ...totals, totals.reduce((a, b) => a + b, 0)];
    }),
  };
}

export const sectLabel = (sect: string | null) => (sect ? (SECT_LABEL[sect as Sect] ?? "") : "");
