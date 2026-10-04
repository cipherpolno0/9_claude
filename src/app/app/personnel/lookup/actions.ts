"use server";

import { requireMenu } from "@/lib/auth/guards";
import { personName } from "@/lib/persons";
import { fetchPerson } from "@/lib/persons-server";
import type { StatusChange } from "@/lib/status";
import { fetchStatusChanges } from "@/lib/status-server";

export type TimelineResult =
  | { ok: true; name: string; personType: string; status: string; changes: StatusChange[] }
  | { ok: false; error: string };

/** เส้นเวลาสถานะของบุคคลหนึ่งคน สำหรับหน้าตรวจสอบ (อ่านในนามผู้ใช้ อยู่ใต้ RLS) */
export async function loadStatusTimeline(personId: string): Promise<TimelineResult> {
  await requireMenu("/app/personnel");
  const person = await fetchPerson(personId);
  if (!person) return { ok: false, error: "ไม่พบบุคคลนี้ หรือท่านไม่มีสิทธิ์ดู" };
  const changes = await fetchStatusChanges(person.id);
  return { ok: true, name: personName(person), personType: person.person_type, status: person.status, changes };
}
