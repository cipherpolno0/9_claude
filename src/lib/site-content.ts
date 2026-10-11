import { examName } from "@/lib/exam-forms";

/** เนื้อหากลางของเว็บ (บทที่ 30): ข่าวประกาศ ดาวน์โหลด ปฏิทินงานสอบ ติดต่อเรา */

export const SITE_TAG = "site-content";
export const SITE_FILES_BUCKET = "site-files";
/** ไม่เกิน 10 MB (ส่งผ่าน Server Action ซึ่งรับได้ไม่เกิน 12 MB ตาม next.config.ts) */
export const SITE_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** ชนิดไฟล์ที่รับ (ต้องตรงกับ allowed_mime_types ของที่เก็บ site-files) */
export const SITE_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const SITE_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp";

/** ที่อยู่สาธารณะของไฟล์ในที่เก็บ site-files */
export function siteFileUrl(path: string): string {
  const safe = path.split("/").map(encodeURIComponent).join("/");
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${SITE_FILES_BUCKET}/${safe}`;
}

export function fileSizeText(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("th-TH")} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} MB`;
}

export const fileKindLabel = (mime: string | null | undefined) =>
  !mime ? "ลิงก์" : mime === "application/pdf" ? "PDF" : mime.includes("word") ? "Word" : mime.includes("excel") || mime.includes("sheet") ? "Excel" : mime.startsWith("image/") ? "รูปภาพ" : "ไฟล์";

// ---------------------------------------------------------------
// ข่าวประกาศ
// ---------------------------------------------------------------
export type PublicAnnouncement = {
  id: string;
  title: string;
  excerpt: string;
  is_pinned: boolean;
  published_on: string;
  file_count: number;
  total_count: number;
};

export type AnnouncementFile = { name: string; path: string; mime_type: string; size_bytes: number };

export type AnnouncementDetail = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  published_on: string;
  updated_at: string;
  files: AnnouncementFile[];
};

export type AdminAnnouncement = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  published_on: string;
  expires_on: string | null;
  is_active: boolean;
  updated_at: string;
  files: { id: string; file_name: string; storage_path: string; mime_type: string; size_bytes: number; is_active: boolean }[];
};

/** สถานะการแสดงบนหน้าเว็บของข่าว (ตามวันที่ไทย) */
export function announcementState(a: Pick<AdminAnnouncement, "is_active" | "published_on" | "expires_on">, today: string) {
  if (!a.is_active) return { key: "inactive", label: "ปิดใช้งาน" } as const;
  if (a.published_on > today) return { key: "scheduled", label: "รอเผยแพร่" } as const;
  if (a.expires_on && a.expires_on < today) return { key: "expired", label: "หมดอายุ" } as const;
  return { key: "live", label: "แสดงอยู่" } as const;
}

// ---------------------------------------------------------------
// ดาวน์โหลด
// ---------------------------------------------------------------
export const DOWNLOAD_CATEGORIES = ["form", "template", "manual", "calendar", "regulation"] as const;
export type DownloadCategory = (typeof DOWNLOAD_CATEGORIES)[number];
export const DOWNLOAD_CATEGORY_LABEL: Record<DownloadCategory, string> = {
  form: "แบบฟอร์ม",
  template: "แม่แบบ Excel",
  manual: "คู่มือ",
  calendar: "ปฏิทิน",
  regulation: "ระเบียบและประกาศ",
};
export const isDownloadCategory = (v: unknown): v is DownloadCategory => (DOWNLOAD_CATEGORIES as readonly string[]).includes(String(v));

export type DownloadItem = {
  id: string;
  category: DownloadCategory;
  title: string;
  description: string;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  updated_at: string;
};

export type AdminDownload = DownloadItem & { sort_order: number; is_active: boolean };

// ---------------------------------------------------------------
// ปฏิทินงานสอบ
// ---------------------------------------------------------------
export type CalendarRow = {
  starts_on: string;
  ends_on: string | null;
  kind: "opens" | "closes" | "exam" | "results" | "request_deadline" | "custom";
  exam_type: string;
  level: string;
  title: string;
  note: string;
};

export type CalendarEvent = { startsOn: string; endsOn: string | null; title: string; note: string; kind: CalendarRow["kind"] };

/** ชื่อรายการปฏิทิน: วันจากรอบสมัครสอบสร้างชื่อจากประเภทและชั้น */
export function calendarEvents(rows: CalendarRow[]): CalendarEvent[] {
  return rows.map((r) => {
    const exam = r.exam_type && r.level ? examName(r.exam_type, r.level) : "";
    const title =
      r.kind === "opens"
        ? `เปิดรับสมัครสอบ${exam}`
        : r.kind === "closes"
          ? `ปิดรับสมัครสอบ${exam}`
          : r.kind === "exam"
            ? `สอบ${exam}`
            : r.kind === "results"
              ? `ประกาศผลสอบ${exam}`
              : r.kind === "request_deadline"
                ? "วันสุดท้ายรับคำขอเปิด ปิด ย้ายสนามสอบ"
                : r.title;
    return { startsOn: r.starts_on, endsOn: r.ends_on, title, note: r.note, kind: r.kind };
  });
}

export type CalendarEventRow = {
  id: string;
  academic_year_id: string;
  starts_on: string;
  ends_on: string | null;
  title: string;
  note: string;
  is_active: boolean;
};

// ---------------------------------------------------------------
// หน้าแรก ติดต่อเรา
// ---------------------------------------------------------------
export type HomeStats = { year_be: number | null; samnak: number; venues: number; candidates: number };

export const CONTACT_TOPIC_KEYS = ["registry", "exams", "results", "requests", "quiz", "system"] as const;
export type ContactTopicKey = (typeof CONTACT_TOPIC_KEYS)[number];
export const isContactTopic = (v: unknown): v is ContactTopicKey => (CONTACT_TOPIC_KEYS as readonly string[]).includes(String(v));

export type SiteContact = {
  agency_name: string;
  address: string;
  phone: string;
  email: string;
  office_hours: string;
  latitude: number | null;
  longitude: number | null;
  map_note: string;
  topics: { key: ContactTopicKey; name: string }[];
};

export const CONTACT_STATUS = ["new", "in_progress", "done", "spam"] as const;
export type ContactStatus = (typeof CONTACT_STATUS)[number];
export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  new: "ใหม่",
  in_progress: "กำลังดำเนินการ",
  done: "ดำเนินการแล้ว",
  spam: "สแปม",
};

export const CONTACT_STATUS_CLASS: Record<ContactStatus, string> = {
  new: "border-destructive bg-destructive/10 text-destructive",
  in_progress: "border-amber-400 bg-amber-50 text-amber-900",
  done: "border-emerald-300 bg-emerald-50 text-emerald-900",
  spam: "border-input bg-muted text-muted-foreground",
};

export type ContactMessage = {
  id: string;
  topic_key: ContactTopicKey;
  sender_name: string;
  sender_email: string;
  sender_phone: string;
  subject: string;
  message: string;
  status: ContactStatus;
  staff_note: string;
  read_at: string | null;
  handled_at: string | null;
  created_at: string;
  contact_topics?: { name: string } | null;
};

/** เวลาขั้นต่ำที่คนใช้กรอกแบบฟอร์มติดต่อ (กันบอทที่ส่งทันที) */
export const CONTACT_MIN_FILL_MS = 3000;

// ---------------------------------------------------------------
// ค้นหารวม
// ---------------------------------------------------------------
export type SearchGroups = {
  too_short?: boolean;
  persons?: { id: string; name: string; unit_name: string; status: string; person_type: string }[];
  places?: { id: string; name: string; code: string; place_type: string; status: string; unit_name: string }[];
  venues?: { id: string; name: string; code: string; venue_type: string; status: string; unit_name: string }[];
  requests?: { id: string; request_no: string; title: string; type_name: string; status: string; submitted_at: string }[];
  documents?: {
    id: string;
    direction: "receive" | "send";
    status: string;
    doc_no: string;
    seq_no: number | null;
    number_year: number | null;
    subject: string;
    classification: string;
    unit_name: string;
    doc_date: string | null;
    closed_at: string | null;
  }[];
};

/** แต่ละกลุ่มคืนไม่เกิน 9 แถว (แถวที่ 9 = มีมากกว่าที่แสดง) */
export const SEARCH_SHOW = 8;
