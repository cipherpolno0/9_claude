import { EXAM_LEVEL_LABEL, EXAM_TYPE_LABEL, type ExamLevel, type ExamType } from "@/lib/exam-forms";

/**
 * ชั้นประโยคบาลี (ตาราง pali_levels บทที่ 33)
 * track pt = เปรียญธรรม (ป.ธ.) / bs = บาลีศึกษา (บ.ศ.)
 * prerequisite_level = ชั้นบาลีที่ต้องสอบได้ก่อน; dhamma_exam_type + dhamma_min_level = วุฒิแผนกธรรมขั้นต่ำ
 * (ได้ชั้นสูงกว่าถือว่าผ่าน) การตรวจผู้สมัครจริงอยู่ในระบบสมัครสอบ ห้ามเขียนกติกาตายตัวในโค้ด ให้อ่านจากตารางนี้
 */
export const PALI_TRACKS = ["pt", "bs"] as const;
export type PaliTrack = (typeof PALI_TRACKS)[number];
export const PALI_TRACK_LABEL: Record<PaliTrack, string> = { pt: "เปรียญธรรม (ป.ธ.)", bs: "บาลีศึกษา (บ.ศ.)" };
/** วุฒิแผนกธรรมที่ใช้กับแต่ละสาย ต้องตรงกับ trigger pali_levels_check */
export const PALI_TRACK_DHAMMA: Record<PaliTrack, ExamType> = { pt: "nak_tham", bs: "tham_sueksa" };

export type PaliLevel = {
  id: string;
  code: string;
  track: PaliTrack;
  name: string;
  sort_order: number;
  prerequisite_level: string | null;
  dhamma_exam_type: ExamType | null;
  dhamma_min_level: ExamLevel | null;
};

export const PALI_LEVEL_COLUMNS = "id, code, track, name, sort_order, prerequisite_level, dhamma_exam_type, dhamma_min_level";

/** ข้อความวุฒิแผนกธรรมขั้นต่ำ เช่น "นักธรรมชั้นโทขึ้นไป" */
export function dhammaRequirementText(level: Pick<PaliLevel, "dhamma_exam_type" | "dhamma_min_level">): string {
  if (!level.dhamma_exam_type || !level.dhamma_min_level) return "ไม่กำหนด";
  return `${EXAM_TYPE_LABEL[level.dhamma_exam_type]}${EXAM_LEVEL_LABEL[level.dhamma_min_level]}ขึ้นไป`;
}
