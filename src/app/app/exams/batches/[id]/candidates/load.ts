import "server-only";

import { notFound, redirect } from "next/navigation";

import type { CandidateRow } from "@/lib/exam-batches";
import { fetchBatch } from "@/lib/exam-batches-server";
import { activeTitles, fetchTitleOptions } from "@/lib/exam-forms-server";

/** ข้อมูลของหน้าฟอร์มรายคน: บัญชี (ต้องแก้ไขได้) และรายการคำนำหน้า */
export async function loadCandidateForm(batchId: string) {
  const batch = await fetchBatch(batchId);
  if (!batch) notFound();
  if (!batch.edit_mode) redirect(`/app/exams/batches/${batch.id}`);
  const titles = activeTitles(await fetchTitleOptions(), batch.round.exam_type);
  return { batch, mode: batch.edit_mode, titles };
}

/** ค่าเดิมของผู้สมัครเป็น {คีย์คอลัมน์: ข้อความ} (ตรงกับ private.candidate_values; ไม่รวมเลขประจำตัว) */
export function candidateValues(c: CandidateRow): Record<string, string> {
  const v: Record<string, string> = { ...(c.extra ?? {}) };
  if (c.seq !== null) v.seq = String(c.seq);
  for (const key of ["title", "first_name", "monastic_name", "last_name", "stage"] as const) if (c[key]) v[key] = c[key];
  if (c.birth_date) v.birth_date = c.birth_date;
  if (c.ordination_date) v.ordination_date = c.ordination_date;
  return v;
}
