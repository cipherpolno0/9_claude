import "server-only";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import { isUuid } from "@/lib/persons-server";
import {
  DIFFICULTIES,
  QUESTION_COLUMNS,
  QUESTION_STATUSES,
  YEAR_MAX,
  YEAR_MIN,
  type ChoiceKey,
  type Course,
  type CourseLevel,
  type CourseStage,
  type CourseSubject,
  type Difficulty,
  type Question,
  type QuestionStatus,
  type Unit,
} from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";

// ทุกฟังก์ชันในไฟล์นี้ทำงานในนามผู้ใช้ (อยู่ใต้ RLS) ผู้ที่ไม่ใช่ผู้จัดการคลังข้อสอบจะได้รายการว่าง

const COURSE_COLUMNS = "id, code, name, level, stage, subject, has_mcq, sort_order";

export async function fetchCourses(): Promise<Course[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select(COURSE_COLUMNS).eq("is_active", true).order("sort_order");
  return (data as Course[] | null) ?? [];
}

export async function fetchCourse(id: string): Promise<Course | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select(COURSE_COLUMNS).eq("id", id).maybeSingle();
  return (data as Course | null) ?? null;
}

/** หน่วยการเรียนของรายวิชาเดียว (รวมหน่วยที่ปิดใช้งาน) หรือทุกหน่วยที่ใช้งานเมื่อไม่ระบุรายวิชา */
export async function fetchUnits(courseId?: string): Promise<Unit[]> {
  const supabase = await createClient();
  let query = supabase.from("units").select("id, course_id, name, sort_order, is_active").order("sort_order").order("name");
  query = courseId ? query.eq("course_id", courseId) : query.eq("is_active", true);
  const { data } = await query.limit(5000);
  return (data as Unit[] | null) ?? [];
}

// ------------------------------------------------------------------
// รายการข้อสอบ
// ------------------------------------------------------------------

export type QuestionRow = {
  id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  unit_id: string;
  unit_name: string;
  question_text: string;
  correct_choice: ChoiceKey;
  source_year_be: number | null;
  difficulty: Difficulty;
  status: QuestionStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_count: number;
};

export function questionsTableParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["created", "course", "year", "status"],
    defaultSort: "created",
    defaultDir: "desc",
    filters: ["course", "unit", "year", "status", "difficulty"],
    pageSize: 10,
  });
}

/** แปลงตัวกรองจากที่อยู่หน้าเว็บเป็นค่าที่ส่งให้ฐานข้อมูล (ค่าที่ไม่ถูกรูปแบบ = ไม่กรอง) ปี "none" = ข้อที่ไม่ระบุปี */
export function questionFilterArgs(params: Pick<TableParams, "q" | "filters">) {
  const { course, unit, year, status, difficulty } = params.filters;
  const yearNumber = Number(year);
  return {
    p_q: params.q,
    p_course: isUuid(course ?? "") ? course : null,
    p_unit: isUuid(unit ?? "") ? unit : null,
    p_year: year === "none" ? 0 : Number.isInteger(yearNumber) && yearNumber >= YEAR_MIN && yearNumber <= YEAR_MAX ? yearNumber : null,
    p_status: status === "inactive" || (QUESTION_STATUSES as readonly string[]).includes(status) ? status : null,
    p_difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty) ? difficulty : null,
  };
}

export async function queryQuestions(params: TableParams) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_questions", {
    ...questionFilterArgs(params),
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.from,
  });
  const rows = (data as QuestionRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

export async function fetchQuestionYears(): Promise<number[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("question_years");
  return ((data as { year_be: number }[] | null) ?? []).map((r) => r.year_be);
}

export type QuestionDetail = Question & {
  courses: Pick<Course, "code" | "name"> | null;
  units: Pick<Unit, "name" | "is_active"> | null;
};

/** คืน null ถ้าไม่พบ หรือผู้ใช้ไม่ใช่ผู้จัดการคลังข้อสอบ */
export async function fetchQuestion(id: string): Promise<QuestionDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select(`${QUESTION_COLUMNS}, courses(code, name), units(name, is_active)`)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as QuestionDetail | null) ?? null;
}

export type QuestionHistoryLog = {
  id: number;
  action: string;
  table_name: string;
  row_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
};

export async function fetchQuestionHistory(id: string): Promise<QuestionHistoryLog[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("question_history", { p_question_id: id });
  return (data as QuestionHistoryLog[] | null) ?? [];
}

// ------------------------------------------------------------------
// แดชบอร์ดคลัง
// ------------------------------------------------------------------

export type BankUnit = { id: string; name: string; published: number; draft: number };
export type BankCourse = {
  id: string;
  code: string;
  name: string;
  level: CourseLevel;
  stage: CourseStage;
  subject: CourseSubject;
  has_mcq: boolean;
  units: BankUnit[];
  published: number;
  draft: number;
};

type SummaryRow = {
  course_id: string;
  course_code: string;
  course_name: string;
  level: CourseLevel;
  stage: CourseStage;
  subject: CourseSubject;
  has_mcq: boolean;
  unit_id: string | null;
  unit_name: string | null;
  published_count: number;
  draft_count: number;
};

/** จำนวนข้อสอบต่อรายวิชาและหน่วย (เรียงตามลำดับรายวิชาและลำดับหน่วยมาจากฐานข้อมูลแล้ว) */
export async function fetchBankSummary(): Promise<BankCourse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quiz_bank_summary");
  if (error) throw error;
  const courses = new Map<string, BankCourse>();
  for (const r of (data as SummaryRow[] | null) ?? []) {
    let course = courses.get(r.course_id);
    if (!course) {
      course = {
        id: r.course_id,
        code: r.course_code,
        name: r.course_name,
        level: r.level,
        stage: r.stage,
        subject: r.subject,
        has_mcq: r.has_mcq,
        units: [],
        published: 0,
        draft: 0,
      };
      courses.set(r.course_id, course);
    }
    if (r.unit_id) {
      course.units.push({ id: r.unit_id, name: r.unit_name ?? "", published: r.published_count, draft: r.draft_count });
      course.published += r.published_count;
      course.draft += r.draft_count;
    }
  }
  return [...courses.values()];
}

/** ค่าเริ่มต้นของเกณฑ์เตือน ถ้าอ่านค่าตั้งไม่ได้ */
export const DEFAULT_MIN_QUESTIONS = 20;
