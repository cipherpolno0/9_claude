/** ข้อความและชนิดข้อมูลของเครื่องอนุมัติกลาง ใช้ร่วมกันทุกระบบ */

import type { OrgLevel } from "@/lib/org-units";

export type RequestStatus = "pending" | "returned" | "approved" | "rejected" | "cancelled";
export type StepStatus = "waiting" | "pending" | "approved" | "rejected" | "returned";
export type Decision = "approved" | "rejected" | "returned";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "รอพิจารณา",
  returned: "ส่งกลับแก้ไข",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  waiting: "ยังไม่ถึงขั้นนี้",
  pending: "รอพิจารณา",
  approved: "เห็นชอบ",
  rejected: "ไม่เห็นชอบ",
  returned: "ส่งกลับแก้ไข",
};

export const DECISION_LABEL: Record<Decision, string> = {
  approved: "เห็นชอบ",
  rejected: "ไม่เห็นชอบ",
  returned: "ส่งกลับแก้ไข",
};

export const EVENT_LABEL: Record<string, string> = {
  submitted: "ยื่นคำขอ",
  approved: "เห็นชอบ",
  rejected: "ไม่เห็นชอบ",
  returned: "ส่งกลับแก้ไข",
  resubmitted: "แก้ไขแล้วส่งใหม่",
  cancelled: "ผู้ยื่นยกเลิกคำขอ",
};

/** ขั้นพิจารณา 1 ขั้นสำหรับวาดเส้นเวลา (แบบสาธารณะจะไม่มีชื่อผู้พิจารณาและความเห็น) */
export type TimelineStep = {
  step_no: number;
  level: OrgLevel;
  unit_name: string;
  status: StepStatus;
  decided_at: string | null;
  decider_name?: string | null;
  comment?: string | null;
};

export type TimelineData = {
  request_no: string;
  type_name: string;
  status: RequestStatus;
  submitted_at: string;
  decided_at: string | null;
  steps: TimelineStep[];
};
