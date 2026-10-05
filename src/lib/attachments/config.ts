/** ชนิดไฟล์แนบที่รับ และขนาดสูงสุด (ต้องตรงกับที่เก็บไฟล์ใน Supabase) */
export const ATTACHMENT_BUCKET = "attachments";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
};
export const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc";

export type Attachment = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  /** รายการเอกสารของคำขอที่ไฟล์นี้แนบให้ (ว่าง = ไฟล์แนบทั่วไป) */
  doc_type_id: string | null;
};
