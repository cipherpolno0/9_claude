/**
 * ตรวจไฟล์ที่อัปโหลด (บทที่ 31): ชนิดไฟล์ดูจากไบต์แรกของเนื้อไฟล์จริง (magic number) ไม่เชื่อชนิดที่เบราว์เซอร์ส่งมา
 * และตรวจขนาด ใช้กับทุกจุดที่รับไฟล์: ไฟล์แนบกลาง หนังสือรับรองขอบัญชี ข่าวและดาวน์โหลด สื่อบทเรียน แฟ้ม Excel นำเข้า
 */
export type FileKind = "pdf" | "png" | "jpeg" | "webp" | "zip" | "ole" | "unknown";

const KIND_OF_MIME: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "zip",
  "application/msword": "ole",
  "application/vnd.ms-excel": "ole",
};

const EXT_ALIASES: Record<string, string> = { jpeg: "jpg" };

export function sniffKind(b: Uint8Array): FileKind {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // %PDF-
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp"; // RIFF....WEBP
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) return "zip"; // docx, xlsx
  if (at(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "ole"; // doc, xls รุ่นเก่า
  return "unknown";
}

export type UploadCheck = { ok: true; mime: string; ext: string } | { ok: false; error: string };

/**
 * allowed = ชนิดที่รับ (mime -> นามสกุลที่ใช้ตั้งชื่อในที่เก็บ)
 * ผ่านเมื่อ: ไม่ว่าง ไม่เกินขนาด เนื้อไฟล์เป็นชนิดที่รับ และนามสกุลของชื่อไฟล์ตรงกับชนิดนั้น
 */
export async function checkUpload(file: File, allowed: Record<string, string>, maxBytes: number, typeError: string): Promise<UploadCheck> {
  if (!file || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์" };
  if (file.size > maxBytes) return { ok: false, error: `ไฟล์ใหญ่เกิน ${Math.round(maxBytes / 1024 / 1024)} MB` };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const kind = sniffKind(head);
  if (kind === "unknown") return { ok: false, error: typeError };
  const nameExt = (file.name.split(".").pop() ?? "").toLowerCase();
  const ext = EXT_ALIASES[nameExt] ?? nameExt;
  const candidates = Object.entries(allowed).filter(([mime]) => KIND_OF_MIME[mime] === kind);
  if (candidates.length === 0) return { ok: false, error: typeError };
  // เลือกชนิดที่นามสกุลตรงกัน (docx กับ xlsx เป็น zip เหมือนกัน แยกด้วยนามสกุล)
  const match = candidates.find(([, e]) => e === ext);
  if (!match) return { ok: false, error: `${typeError} (นามสกุลไฟล์ไม่ตรงกับเนื้อไฟล์)` };
  return { ok: true, mime: match[0], ext: match[1] };
}
