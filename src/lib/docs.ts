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

export const DOC_TABS = ["receive", "send", "draft"] as const;
export type DocTab = (typeof DOC_TABS)[number];
export const DOC_TAB_LABEL: Record<DocTab, string> = { receive: "หนังสือรับ", send: "หนังสือส่ง", draft: "ร่าง" };
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
  deliveries: {
    id: string;
    unit_name: string;
    status: "pending" | "received" | "cancelled";
    received_at: string | null;
    receive_no: number | null;
    receive_year: number | null;
  }[];
  source: { id: string; unit_name: string; doc_no: string } | null;
  letterhead: Letterhead | null;
};

export const DELIVERY_STATUS_LABEL = { pending: "รอลงรับ", received: "ลงรับแล้ว", cancelled: "ยกเลิก" } as const;

/** คำขึ้นต้นและคำลงท้ายที่ใช้บ่อย เป็นเพียงตัวช่วยพิมพ์ ผู้ใช้พิมพ์คำอื่นได้ */
export const SALUTATION_HINTS = ["เรียน", "กราบเรียน", "นมัสการ"];
export const CLOSING_HINTS = ["ขอแสดงความนับถือ", "ขอแสดงความนับถืออย่างยิ่ง", "ขอนมัสการด้วยความเคารพ"];
