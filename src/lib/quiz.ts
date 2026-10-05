/** ชนิดข้อมูลและป้ายชื่อของคลังข้อสอบ (ระบบที่ 3) ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

export const COURSE_LEVELS = ["tri", "tho", "ek"] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];
export const COURSE_LEVEL_LABEL: Record<CourseLevel, string> = {
  tri: "ธรรมศึกษาชั้นตรี",
  tho: "ธรรมศึกษาชั้นโท",
  ek: "ธรรมศึกษาชั้นเอก",
};

export const COURSE_STAGES = ["primary", "secondary", "higher"] as const;
export type CourseStage = (typeof COURSE_STAGES)[number];
export const COURSE_STAGE_LABEL: Record<CourseStage, string> = {
  primary: "ประถมศึกษา",
  secondary: "มัธยมศึกษา",
  higher: "อุดมศึกษาและประชาชนทั่วไป",
};

export const COURSE_SUBJECTS = ["dhamma", "buddha", "vinaya", "kratu"] as const;
export type CourseSubject = (typeof COURSE_SUBJECTS)[number];
export const COURSE_SUBJECT_LABEL: Record<CourseSubject, string> = {
  dhamma: "ธรรม",
  buddha: "พุทธ",
  vinaya: "วินัย",
  kratu: "กระทู้ธรรม",
};

export type Course = {
  id: string;
  code: string;
  name: string;
  level: CourseLevel;
  stage: CourseStage;
  subject: CourseSubject;
  /** false = วิชากระทู้ธรรม (ข้อเขียน ไม่มีข้อสอบปรนัย) */
  has_mcq: boolean;
  sort_order: number;
};

export type Unit = { id: string; course_id: string; name: string; sort_order: number; is_active: boolean };

export const CHOICE_KEYS = ["a", "b", "c", "d"] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];
export const CHOICE_LABEL: Record<ChoiceKey, string> = { a: "ก", b: "ข", c: "ค", d: "ง" };
export const isChoiceKey = (value: unknown): value is ChoiceKey => (CHOICE_KEYS as readonly string[]).includes(String(value));

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "ง่าย", medium: "ปานกลาง", hard: "ยาก" };

export const QUESTION_STATUSES = ["draft", "published"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = { draft: "ร่าง", published: "เผยแพร่" };
export const QUESTION_STATUS_CLASS: Record<string, string> = {
  draft: "border-amber-300 bg-amber-100 text-amber-900",
  published: "border-green-300 bg-green-100 text-green-900",
  inactive: "border-stone-300 bg-stone-200 text-stone-800",
};

export type Question = {
  id: string;
  course_id: string;
  unit_id: string;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: ChoiceKey;
  explanation: string;
  source_year_be: number | null;
  difficulty: Difficulty;
  status: QuestionStatus;
  published_at: string | null;
  is_active: boolean;
  /** บทเรียนที่เกี่ยวข้อง (ไม่บังคับ) ใช้ยกหัวข้อที่ตอบผิดไว้บนสุด */
  lesson_id: string | null;
  created_at: string;
  updated_at: string;
};

/** คอลัมน์ของ questions ที่หน้าเว็บอ่าน (ไม่อ่าน dup_key ซึ่งเป็นค่าที่ระบบคำนวณ) */
export const QUESTION_COLUMNS =
  "id, course_id, unit_id, question_text, choice_a, choice_b, choice_c, choice_d, correct_choice, explanation, source_year_be, difficulty, status, published_at, is_active, lesson_id, created_at, updated_at";

export const choiceText = (q: Pick<Question, "choice_a" | "choice_b" | "choice_c" | "choice_d">, key: ChoiceKey) =>
  q[`choice_${key}`];

export const QUESTION_FIELD_LABEL: Record<string, string> = {
  course_id: "รายวิชา",
  unit_id: "หน่วยการเรียน",
  lesson_id: "บทเรียนที่เกี่ยวข้อง",
  question_text: "โจทย์",
  choice_a: "ตัวเลือก ก",
  choice_b: "ตัวเลือก ข",
  choice_c: "ตัวเลือก ค",
  choice_d: "ตัวเลือก ง",
  correct_choice: "ข้อถูก",
  explanation: "คำอธิบายเฉลย",
  source_year_be: "ปีของข้อสอบสนามหลวง",
  difficulty: "ระดับความยาก",
  status: "สถานะ",
  published_at: "เวลาที่เผยแพร่",
  is_active: "ใช้งาน",
};

/** ปี พ.ศ. ที่รับได้ (ตรงกับ check constraint ของ questions.source_year_be) */
export const YEAR_MIN = 2400;
export const YEAR_MAX = 2700;

// ------------------------------------------------------------------
// นำเข้าจาก Excel
// ------------------------------------------------------------------

export const QUESTION_IMPORT_HEADERS = ["รายวิชา", "หน่วย", "โจทย์", "ก", "ข", "ค", "ง", "ข้อถูก", "เฉลย", "ปี"] as const;
export const QUESTION_IMPORT_MAX_ROWS = 2000;

export type QuestionImportRaw = { rowNumber: number; cells: string[] };

/** ข้อมูลหนึ่งแถวที่ผ่านการตรวจรูปแบบแล้ว (ส่งให้ฟังก์ชันฐานข้อมูลตรวจต่อ) */
export type QuestionImportData = {
  row_number: number;
  course: string;
  unit: string;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct: string;
  explanation: string;
  year: number | null;
};

export type QuestionImportRow = QuestionImportRaw & {
  status: "new" | "skip" | "error";
  message: string;
  data: QuestionImportData | null;
};

const CORRECT_BY_TEXT: Record<string, ChoiceKey> = {
  ก: "a", ข: "b", ค: "c", ง: "d",
  a: "a", b: "b", c: "c", d: "d",
  "1": "a", "2": "b", "3": "c", "4": "d",
  "๑": "a", "๒": "b", "๓": "c", "๔": "d",
};

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const arabic = (text: string) => text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

/** ตรวจรูปแบบของแต่ละแถว (ช่องที่ต้องกรอก ข้อถูก ปี) ก่อนส่งให้ฐานข้อมูลตรวจรายวิชา หน่วย และข้อซ้ำ */
export function validateQuestionImportRows(raw: QuestionImportRaw[]): QuestionImportRow[] {
  return raw.map(({ rowNumber, cells }) => {
    const c = QUESTION_IMPORT_HEADERS.map((_, i) => String(cells[i] ?? "").trim());
    const [course, unit, question, a, b, c3, d, correctRaw, explanation, yearRaw] = c;
    const errors: string[] = [];

    if (!course) errors.push("ไม่ได้กรอกรายวิชา");
    if (!unit) errors.push("ไม่ได้กรอกหน่วย");
    if (!question) errors.push("ไม่ได้กรอกโจทย์");
    if (!a || !b || !c3 || !d) errors.push("ตัวเลือกไม่ครบ 4 ข้อ");

    // ข้อถูก: รับ ก ข ค ง (มีจุดหรือวงเล็บต่อท้ายได้) หรือ a-d หรือ 1-4
    const correctKey = correctRaw.toLowerCase().replace(/^ข้อ\s*/, "").replace(/[.)\s]/g, "");
    const correct = CORRECT_BY_TEXT[correctKey];
    if (!correctRaw) errors.push("ไม่มีข้อถูก");
    else if (!correct) errors.push(`ข้อถูก "${correctRaw}" ไม่ถูกต้อง ต้องเป็น ก ข ค หรือ ง`);

    let year: number | null = null;
    if (yearRaw) {
      const n = Number(arabic(yearRaw));
      if (!Number.isInteger(n) || n < YEAR_MIN || n > YEAR_MAX) errors.push(`ปี "${yearRaw}" ไม่ถูกต้อง ต้องเป็นปี พ.ศ. เช่น 2567`);
      else year = n;
    }

    if (errors.length > 0) return { rowNumber, cells: c, status: "error", message: errors.join(" / "), data: null };
    return {
      rowNumber,
      cells: c,
      status: "new",
      message: "",
      data: {
        row_number: rowNumber,
        course,
        unit,
        question_text: question,
        choice_a: a,
        choice_b: b,
        choice_c: c3,
        choice_d: d,
        correct: correct as string,
        explanation,
        year,
      },
    };
  });
}

// ------------------------------------------------------------------
// บทเรียน (บทที่ 13)
// ------------------------------------------------------------------

/** ชิ้นเนื้อหาของบทเรียน เรียงตามลำดับที่แสดง (ต้องตรงกับที่ trigger lessons_rules ตรวจ) */
export type LessonBlock =
  | { type: "text"; text: string }
  | { type: "image"; path: string; caption: string }
  | { type: "video"; video_id: string }
  | { type: "pdf"; path: string; title: string };

export const LESSON_BLOCK_LABEL: Record<LessonBlock["type"], string> = {
  text: "ข้อความ",
  image: "รูป",
  video: "วิดีโอ YouTube",
  pdf: "ไฟล์ PDF",
};
export const LESSON_MAX_BLOCKS = 60;
export const LESSON_TEXT_MAX = 20000;

export type Lesson = {
  id: string;
  unit_id: string;
  title: string;
  blocks: LessonBlock[];
  sort_order: number;
  status: QuestionStatus;
  published_at: string | null;
  is_active: boolean;
};

export const LESSON_STATUS_LABEL = QUESTION_STATUS_LABEL;

/** ที่เก็บรูปและ PDF ของบทเรียน (แบบสาธารณะ) */
export const LESSON_MEDIA_BUCKET = "lesson-media";
export const LESSON_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const LESSON_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LESSON_PDF_MAX_BYTES = 10 * 1024 * 1024;

/** ที่อยู่ของไฟล์ในที่เก็บสาธารณะของบทเรียน */
export function lessonMediaUrl(path: string): string {
  const safe = path.split("/").map(encodeURIComponent).join("/");
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${LESSON_MEDIA_BUCKET}/${safe}`;
}

/** ดึงรหัสวิดีโอ 11 ตัวจากลิงก์ YouTube (watch, youtu.be, embed, shorts, live) หรือรับรหัสตรง ๆ คืน null ถ้าไม่ใช่ */
export function youtubeId(input: string): string | null {
  const text = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  const match = text.match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/,
  );
  return match ? match[1] : null;
}

// ------------------------------------------------------------------
// เส้นทางเรียนของผู้เรียน (หน้าสาธารณะ /quiz)
// ------------------------------------------------------------------

export const QUIZ_BASE = "/quiz";
/** ที่อยู่ของรายวิชาในหน้าสาธารณะ เช่น tri-primary-dhamma */
export const courseSlug = (c: { level: string; stage: string; subject: string }) => `${c.level}-${c.stage}-${c.subject}`;

export function parseCourseSlug(slug: string): { level: CourseLevel; stage: CourseStage; subject: CourseSubject } | null {
  const [level, stage, subject, ...rest] = slug.split("-");
  if (rest.length > 0) return null;
  if (!(COURSE_LEVELS as readonly string[]).includes(level)) return null;
  if (!(COURSE_STAGES as readonly string[]).includes(stage)) return null;
  if (!(COURSE_SUBJECTS as readonly string[]).includes(subject)) return null;
  return { level: level as CourseLevel, stage: stage as CourseStage, subject: subject as CourseSubject };
}

export const ATTEMPT_KINDS = ["pre", "post", "full"] as const;
export type AttemptKind = (typeof ATTEMPT_KINDS)[number];
export const ATTEMPT_KIND_LABEL: Record<AttemptKind, string> = {
  pre: "แบบทดสอบก่อนเรียน",
  post: "แบบทดสอบหลังเรียน",
  full: "ทดสอบรวมทั้งวิชา",
};

/** เวลาแบบ นาที:วินาที หรือ ชั่วโมง:นาที:วินาที */
export function clockText(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** เวลาที่ใช้แบบข้อความ เช่น 12 นาที 5 วินาที */
export function durationText(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} นาที ${s} วินาที` : `${s} วินาที`;
}
