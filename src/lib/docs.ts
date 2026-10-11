/** สารบรรณ (บทที่ 27): ป้ายชื่อ ชนิดข้อมูล และตัวช่วยที่ใช้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

export const DOC_KINDS = ["external", "internal", "circular", "order", "announcement"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  external: "หนังสือภายนอก",
  internal: "หนังสือภายใน",
  circular: "หนังสือเวียน",
  order: "คำสั่ง",
  announcement: "ประกาศ",
};

export const DOC_URGENCIES = ["normal", "urgent", "very_urgent", "most_urgent"] as const;
export type DocUrgency = (typeof DOC_URGENCIES)[number];
export const DOC_URGENCY_LABEL: Record<DocUrgency, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};

export const DOC_CLASSES = ["normal", "confidential", "secret", "top_secret"] as const;
export type DocClass = (typeof DOC_CLASSES)[number];
export const DOC_CLASS_LABEL: Record<DocClass, string> = {
  normal: "ไม่มี (หนังสือทั่วไป)",
  confidential: "ลับ",
  secret: "ลับมาก",
  top_secret: "ลับที่สุด",
};
/** ป้ายสั้นสำหรับตารางและตราประทับ */
export const docClassShort = (c: DocClass) => (c === "normal" ? "" : DOC_CLASS_LABEL[c]);

export type DocStatus = "draft" | "issued" | "sent" | "received" | "cancelled";
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: "ร่าง",
  issued: "ออกเลขแล้ว",
  sent: "ส่งแล้ว",
  received: "ลงรับแล้ว",
  cancelled: "ยกเลิก",
};

export const DOC_TABS = ["receive", "send", "draft", "archive"] as const;
export type DocTab = (typeof DOC_TABS)[number];
export const DOC_TAB_LABEL: Record<DocTab, string> = { receive: "หนังสือรับ", send: "หนังสือส่ง", draft: "ร่าง", archive: "คลังเก็บ" };
export const isDocTab = (v: unknown): v is DocTab => (DOC_TABS as readonly string[]).includes(String(v));

export const isDocKind = (v: unknown): v is DocKind => (DOC_KINDS as readonly string[]).includes(String(v));
export const isDocUrgency = (v: unknown): v is DocUrgency => (DOC_URGENCIES as readonly string[]).includes(String(v));
export const isDocClass = (v: unknown): v is DocClass => (DOC_CLASSES as readonly string[]).includes(String(v));

/** ชนิดที่ต้องมีผู้รับ (ถึง / เรียน) */
export const needsRecipient = (k: DocKind) => k === "external" || k === "internal" || k === "circular";

/** ตัวอย่างเลขที่หนังสือส่งตามชุด (แสดงในฟอร์มก่อนออกเลข) */
export function docNoExample(kind: DocKind, prefix: string, yearBe: number): string {
  if (kind === "order" || kind === "announcement") return `ลำดับ/${yearBe}`;
  const p = prefix || "(รหัสหนังสือ)";
  return kind === "circular" ? `${p}/ว ลำดับ` : `${p}/ลำดับ`;
}

export const currentYearBe = () =>
  Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 4)) + 543;

export type DocsUnit = { id: string; name: string; code: string; level: string; can_edit: boolean };

export type DocRow = {
  id: string;
  kind: DocKind;
  status: DocStatus;
  series: string | null;
  number_year: number | null;
  seq_no: number | null;
  doc_no: string;
  doc_date: string | null;
  from_text: string;
  to_text: string;
  subject: string;
  urgency: DocUrgency;
  classification: DocClass;
  received_at: string | null;
  issued_at: string | null;
  sent_at: string | null;
  updated_at: string;
  is_copy: boolean;
  delivery_total: number;
  delivery_received: number;
  attachment_count: number;
  masked: boolean;
  total_count: number;
};

export type IncomingDoc = {
  delivery_id: string;
  document_id: string;
  from_unit_name: string;
  doc_no: string;
  doc_date: string | null;
  subject: string;
  kind: DocKind;
  urgency: DocUrgency;
  classification: DocClass;
  sent_at: string;
};

export type Letterhead = { code_prefix: string; agency_name: string; address: string };

export type DocDetail = {
  id: string;
  org_unit_id: string;
  org_unit_name: string;
  direction: "receive" | "send";
  kind: DocKind;
  status: DocStatus;
  series: string | null;
  number_year: number | null;
  seq_no: number | null;
  doc_no: string;
  doc_date: string | null;
  from_text: string;
  to_text: string;
  subject: string;
  urgency: DocUrgency;
  classification: DocClass;
  salutation: string;
  body: string;
  closing: string;
  signer_name: string;
  signer_position: string;
  note: string;
  received_at: string | null;
  issued_at: string | null;
  sent_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  registered_by: string | null;
  registered_by_name: string | null;
  issued_by_name: string | null;
  sent_by_name: string | null;
  cancelled_by_name: string | null;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  source_document_id: string | null;
  to_units: { id: string; name: string }[];
  viewers: { user_id: string; name: string }[];
  source: { id: string; unit_name: string; doc_no: string } | null;
  letterhead: Letterhead | null;
  // บทที่ 28: เส้นทางหนังสือ
  scope: "owner" | "recipient";
  can_command: boolean;
  can_view_unit: boolean;
  reply_required: boolean;
  reply_due_on: string | null;
  routes: DocRoute[];
  source_route: {
    id: string;
    reply_required: boolean;
    reply_due_on: string | null;
    reply_text: string | null;
    replied_at: string | null;
    message: string;
    from_unit_name: string;
    to_unit_id: string;
    // บทที่ 29: เวลาของเส้นทางที่ส่งมาถึง (เส้นเวลา)
    from_name?: string | null;
    source_doc_date?: string | null;
    source_issued_at?: string | null;
    sent_at?: string;
    read_at?: string | null;
    received_at?: string | null;
  } | null;
  // บทที่ 29: ปิดเรื่อง คลังเก็บ คำขอที่เกี่ยวข้อง
  closed_at: string | null;
  closed_by_name: string | null;
  close_note: string | null;
  open_work: number;
  retention_years: number | null;
  retain_until: string | null;
  close_events: { action: "close" | "reopen"; note: string; at: string; actor_name: string | null }[];
  requests: DocRequestLink[];
  requests_hidden: number;
};

/** คำขอที่อ้างอิงหนังสือ (หน้าหนังสือ) */
export type DocRequestLink = {
  link_id: string;
  request_id: string;
  request_no: string;
  title: string;
  type_name: string;
  status: string;
  source: "manual" | "auto";
  can_remove: boolean;
};

// ---------------------------------------------------------------
// บทที่ 28: เส้นทางหนังสือ กล่องหนังสือเข้า งาน
// ---------------------------------------------------------------
export type RouteAction = "propose" | "order" | "forward" | "inform" | "act";
export const ROUTE_ACTION_LABEL: Record<RouteAction, string> = {
  propose: "เสนอ",
  order: "สั่งการ",
  forward: "ส่งถึงหน่วย",
  inform: "แจ้งเพื่อทราบ",
  act: "มอบหมายดำเนินการ",
};
export type RouteStatus = "pending" | "read" | "received" | "done" | "cancelled";
export const ROUTE_STATUS_LABEL: Record<RouteStatus, string> = {
  pending: "ยังไม่เปิดอ่าน",
  read: "เปิดอ่านแล้ว",
  received: "ลงรับแล้ว",
  done: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

export type DocRoute = {
  id: string;
  action: RouteAction;
  status: RouteStatus;
  message: string;
  due_on: string | null;
  from_user_id: string | null;
  from_name: string | null;
  from_unit_name: string;
  to_user_id: string | null;
  to_name: string | null;
  to_unit_id: string | null;
  parent_route_id: string | null;
  sent_at: string;
  read_at: string | null;
  received_at: string | null;
  receive_no: number | null;
  receive_year: number | null;
  reply_text: string | null;
  replied_at: string | null;
  replied_by_name: string | null;
  done_note: string | null;
  done_at: string | null;
  mine: boolean;
  can_cancel: boolean;
  file_count: number;
};

export type InboxItem = {
  route_id: string;
  document_id: string;
  action: RouteAction;
  kind: DocKind;
  doc_no: string;
  doc_date: string | null;
  subject: string;
  urgency: DocUrgency;
  classification: DocClass;
  from_name: string | null;
  from_unit_name: string;
  to_unit_id: string | null;
  to_unit_name: string | null;
  message: string;
  due_on: string | null;
  sent_at: string;
  read_at: string | null;
  status: RouteStatus;
  can_receive: boolean;
  reply_required: boolean;
  replied: boolean;
  received_document_id: string | null;
};

export type TaskRow = {
  route_id: string;
  document_id: string;
  doc_no: string;
  subject: string;
  kind: DocKind;
  urgency: DocUrgency;
  classification: DocClass;
  org_unit_id: string;
  org_unit_name: string;
  from_name: string | null;
  to_name: string | null;
  message: string;
  due_on: string | null;
  sent_at: string;
  read_at: string | null;
  status: RouteStatus;
  done_at: string | null;
  done_note: string | null;
  overdue: boolean;
  attachment_count: number;
};

export type RouteCandidate = { user_id: string; name: string; roles: string | null };

/** สรุปการส่งถึงหน่วย (หนังสือเวียนแจ้งงาน): เปิดอ่าน ยังไม่อ่าน ลงรับ ตอบแล้ว */
export function forwardSummary(routes: DocRoute[]) {
  const f = routes.filter((r) => r.action === "forward" && r.status !== "cancelled");
  return {
    total: f.length,
    unread: f.filter((r) => r.status === "pending").length,
    read: f.filter((r) => r.status !== "pending").length,
    received: f.filter((r) => r.status === "received").length,
    replied: f.filter((r) => r.reply_text !== null).length,
  };
}


/** คำขึ้นต้นและคำลงท้ายที่ใช้บ่อย เป็นเพียงตัวช่วยพิมพ์ ผู้ใช้พิมพ์คำอื่นได้ */
export const SALUTATION_HINTS = ["เรียน", "กราบเรียน", "นมัสการ"];
export const CLOSING_HINTS = ["ขอแสดงความนับถือ", "ขอแสดงความนับถืออย่างยิ่ง", "ขอนมัสการด้วยความเคารพ"];

// ---------------------------------------------------------------
// บทที่ 29: ค้นหา คลังเก็บ อ้างอิงคำขอ รายงาน
// ---------------------------------------------------------------
export type ArchiveRow = {
  id: string;
  direction: "receive" | "send";
  kind: DocKind;
  status: DocStatus;
  series: string | null;
  number_year: number | null;
  seq_no: number | null;
  doc_no: string;
  doc_date: string | null;
  from_text: string;
  to_text: string;
  subject: string;
  urgency: DocUrgency;
  classification: DocClass;
  received_at: string | null;
  closed_at: string;
  closed_by_name: string | null;
  close_note: string;
  retention_years: number | null;
  retain_until: string | null;
  masked: boolean;
  total_count: number;
};

export type SearchRow = {
  id: string;
  org_unit_id: string;
  unit_name: string;
  direction: "receive" | "send";
  kind: DocKind;
  status: DocStatus;
  seq_no: number | null;
  number_year: number | null;
  doc_no: string;
  doc_date: string | null;
  received_at: string | null;
  from_text: string;
  to_text: string;
  subject: string;
  urgency: DocUrgency;
  classification: DocClass;
  closed_at: string | null;
  snippet: string;
  total_count: number;
};

/** เงื่อนไขค้นหา (?no= &subject= &from= &to= &df= &dt= &kind= &urgency= &dir= &body= &archive=1 &unit=) */
export type DocSearch = {
  unit: string;
  no: string;
  subject: string;
  from: string;
  to: string;
  df: string;
  dt: string;
  kind: string;
  urgency: string;
  dir: string;
  body: string;
  archive: boolean;
};

export const searchIsEmpty = (s: DocSearch) =>
  !s.no && !s.subject && !s.from && !s.to && !s.df && !s.dt && !s.kind && !s.urgency && !s.dir && !s.body;

/** หนังสืออ้างอิงของคำขอ (หน้าคำขอกลาง) */
export type RequestDocLink = {
  link_id: string;
  document_id: string;
  unit_name: string;
  direction: "receive" | "send";
  kind: DocKind;
  status: DocStatus;
  doc_no: string;
  doc_date: string | null;
  seq_no: number | null;
  number_year: number | null;
  subject: string;
  urgency: DocUrgency;
  classification: DocClass;
  closed_at: string | null;
  source: "manual" | "auto";
  created_by_name: string | null;
  created_at: string;
  can_remove: boolean;
};
export type RequestDocLinks = { linkable: boolean; items: RequestDocLink[]; hidden: number };

export type LinkCandidate = {
  id: string;
  unit_name: string;
  direction: "receive" | "send";
  doc_no: string;
  doc_date: string | null;
  seq_no: number | null;
  number_year: number | null;
  subject: string;
  classification: DocClass;
};

/** ป้ายของหนังสือในรายการอ้างอิง: เลขที่ หรือ เลขรับ */
export function docRefLabel(d: { direction: "receive" | "send"; doc_no: string; seq_no: number | null; number_year: number | null }) {
  if (d.direction === "receive") return `เลขรับ ${d.seq_no ?? "-"}/${d.number_year ?? "-"}${d.doc_no ? ` (ที่ ${d.doc_no})` : ""}`;
  return d.doc_no ? `ที่ ${d.doc_no}` : "ร่าง";
}

export const DOC_REPORT_KINDS = ["register", "pending", "duration"] as const;
export type DocReportKind = (typeof DOC_REPORT_KINDS)[number];
export const DOC_REPORT_LABEL: Record<DocReportKind, string> = {
  register: "ทะเบียนหนังสือรับ-ส่งรายเดือน",
  pending: "หนังสือค้างดำเนินการ",
  duration: "เวลาเฉลี่ยในการดำเนินการต่อหน่วย",
};
export const isDocReportKind = (v: unknown): v is DocReportKind => (DOC_REPORT_KINDS as readonly string[]).includes(String(v));

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export type RegisterRow = {
  id: string;
  kind: DocKind;
  status: DocStatus;
  series: string | null;
  seq_no: number | null;
  number_year: number | null;
  doc_no: string;
  doc_date: string | null;
  received_at: string | null;
  from_text: string;
  to_text: string;
  subject: string;
  urgency: DocUrgency;
  classification: DocClass;
  action_text: string;
  note: string;
  masked: boolean;
};

export type PendingRow = {
  id: string;
  direction: "receive" | "send";
  kind: DocKind;
  status: DocStatus;
  seq_no: number | null;
  number_year: number | null;
  doc_no: string;
  doc_date: string | null;
  subject: string;
  urgency: DocUrgency;
  classification: DocClass;
  started_at: string;
  days: number;
  act_open: number;
  act_overdue: number;
  propose_open: number;
  forward_unreceived: number;
  reply_waiting: number;
  holders: string;
  masked: boolean;
};

/** สิ่งที่หนังสือค้างรออยู่ (ข้อความสั้นสำหรับรายงาน) */
export function pendingWaitText(r: PendingRow): string {
  const parts: string[] = [];
  if (r.propose_open) parts.push(`เสนอรอสั่งการ ${r.propose_open}`);
  if (r.act_open) parts.push(`งานมอบหมายรอรายงานผล ${r.act_open}${r.act_overdue ? ` (เกินกำหนด ${r.act_overdue})` : ""}`);
  if (r.forward_unreceived) parts.push(`รอปลายทางลงรับ ${r.forward_unreceived} หน่วย`);
  if (r.reply_waiting) parts.push(`รอคำตอบ ${r.reply_waiting} หน่วย`);
  if (!parts.length) parts.push(r.status === "issued" ? "ออกเลขแล้ว ยังไม่ส่ง" : "รอปิดเรื่อง");
  return parts.join(" · ");
}

export type DurationRow = {
  org_unit_id: string;
  unit_name: string;
  unit_code: string;
  received_count: number;
  closed_count: number;
  avg_days: number | null;
  min_days: number | null;
  max_days: number | null;
  open_count: number;
  act_done: number;
  act_avg_days: number | null;
  act_late: number;
};

export type RetentionRule = { kind: DocKind; years: number | null; note: string; updated_at: string };
