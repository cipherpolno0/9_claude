/** ตัวช่วยแสดงผลแบบไทย: วันที่ พ.ศ. และเลขไทย */

const THAI_DIGITS = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];

export function toThaiDigits(text: string | number): string {
  return String(text).replace(/[0-9]/g, (d) => THAI_DIGITS[Number(d)]);
}

export type DigitMode = "arabic" | "thai";

export function digits(text: string | number, mode: DigitMode): string {
  return mode === "thai" ? toThaiDigits(text) : String(text);
}

/** วันที่แบบไทย เช่น 3 ตุลาคม 2569 (เวลาประเทศไทย) */
export function thaiDate(iso: string | Date | null | undefined, style: "long" | "short" = "long"): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/** วันที่และเวลาแบบไทย เช่น 3 ต.ค. 2569 14:05 น. */
export function thaiDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  return `${thaiDate(d, "short")} ${time} น.`;
}

/** วันที่แบบตัวเลข วว/ดด/ปปปป (พ.ศ.) สำหรับไฟล์ส่งออก คืนค่าว่างถ้าไม่มีวันที่ */
export function toBuddhistDateText(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : "";
}
