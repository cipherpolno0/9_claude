import "server-only";

import { unstable_cache } from "next/cache";

import {
  FORMS_TAG,
  type ExamRound,
  type FormTemplate,
  type TitleOption,
} from "@/lib/exam-forms";
import { explainError } from "@/lib/errors";
import { PUBLIC_CACHE_SECONDS } from "@/lib/registry";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

const TEMPLATE_COLUMNS =
  "id, code, exam_type, level, sheet_name, marker_code, marker_no, version, notice, title, header_cells, columns, layout, signatures, sort_order, is_active, updated_at";

/** แบบฟอร์มทั้งหมด (ผู้ดูแลระบบเห็นรวมที่ปิดใช้งาน ผู้อื่นเห็นเฉพาะที่ใช้งาน ตาม RLS) */
export async function fetchFormTemplates(): Promise<FormTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("form_templates").select(TEMPLATE_COLUMNS).order("sort_order").order("code");
  return (data as FormTemplate[] | null) ?? [];
}

export async function fetchFormTemplate(id: string): Promise<FormTemplate | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("form_templates").select(TEMPLATE_COLUMNS).eq("id", id).maybeSingle();
  return (data as FormTemplate | null) ?? null;
}

export async function fetchTitleOptions(): Promise<TitleOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_title_options")
    .select("id, exam_type, name, sort_order, is_active")
    .order("exam_type")
    .order("sort_order")
    .order("name");
  return (data as TitleOption[] | null) ?? [];
}

/** คำนำหน้าที่ใช้งานอยู่ของประเภทการสอบ (ใช้สร้างรายการให้เลือกในแม่แบบ) */
export const activeTitles = (options: Pick<TitleOption, "exam_type" | "name" | "is_active">[], examType: string) =>
  options.filter((o) => o.exam_type === examType && o.is_active !== false).map((o) => o.name);

export type PublicForms = { templates: FormTemplate[]; titles: TitleOption[] };

/** แบบฟอร์มสำหรับหน้าสาธารณะ ดาวน์โหลด (อ่านในนาม anon แคช 5 นาที ล้างทันทีเมื่อผู้ดูแลระบบแก้) */
export const fetchPublicForms = unstable_cache(
  async (): Promise<PublicForms> => {
    const { data, error } = await createPublicClient().rpc("public_form_templates");
    if (error) throw new Error(error.message);
    const value = (data ?? {}) as Partial<PublicForms>;
    return { templates: value.templates ?? [], titles: value.titles ?? [] };
  },
  ["public-form-templates"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [FORMS_TAG] },
);

type RoundRow = Omit<ExamRound, "year_be"> & { academic_years: { year_be: number } | null };

/** รอบสมัครสอบทั้งหมด (ผู้จัดการรอบเห็นรวมที่ยกเลิก) เรียงปีล่าสุดก่อน */
export async function fetchExamRounds(): Promise<ExamRound[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_rounds")
    .select(
      "id, academic_year_id, exam_type, level, opens_on, closes_on, exam_starts_on, exam_ends_on, status, note, is_active, updated_at, academic_years(year_be)",
    );
  const levelOrder = { tri: 1, tho: 2, ek: 3 } as const;
  return ((data as RoundRow[] | null) ?? [])
    .map(({ academic_years, ...r }) => ({ ...r, year_be: academic_years?.year_be ?? 0 }))
    .sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) ||
        b.year_be - a.year_be ||
        a.exam_type.localeCompare(b.exam_type) ||
        levelOrder[a.level] - levelOrder[b.level],
    );
}

export type RegisterRound = {
  id: string;
  year_be: number;
  exam_type: ExamRound["exam_type"];
  level: ExamRound["level"];
  opens_on: string;
  closes_on: string;
  exam_starts_on: string;
  exam_ends_on: string | null;
  status: ExamRound["status"];
  accepting: boolean;
  form_code: string | null;
};

/** รอบที่เปิดรับสมัคร (ฐานข้อมูลบอกว่าวันนี้อยู่ในช่วงรับสมัครหรือไม่) */
export async function fetchRegisterRounds(): Promise<RegisterRound[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("exam_register_rounds");
  return (data as RegisterRound[] | null) ?? [];
}

export type TemplateContext = {
  round_id: string;
  year_be: number;
  exam_type: ExamRound["exam_type"];
  level: ExamRound["level"];
  template_id: string;
  place: { id: string; code: string; name: string; place_type: string };
  venue: {
    id: string;
    code: string;
    name: string;
    subdistrict: string | null;
    district: string | null;
    province: string | null;
    region_name: string | null;
  };
};

/** ตรวจรอบ สำนัก และสนามสอบที่ฐานข้อมูล แล้วคืนข้อมูลสำหรับเติมหัวแฟ้ม */
export async function fetchTemplateContext(
  roundId: string,
  placeId: string,
  venueId: string,
): Promise<{ ok: true; context: TemplateContext } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exam_template_context", {
    p_round: roundId,
    p_place: placeId,
    p_venue: venueId,
  });
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true, context: data as TemplateContext };
}
