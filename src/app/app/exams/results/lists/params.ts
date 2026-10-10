import "server-only";

import type { ExamRound } from "@/lib/exam-forms";
import { fetchExamRounds } from "@/lib/exam-forms-server";
import { isUuid } from "@/lib/exam-results-server";

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

function read(raw: Raw, key: string): string {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? "";
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export type PassListParams = {
  rounds: ExamRound[];
  round: ExamRound | null;
  unit: string | null;
  place: string | null;
  venue: string | null;
  by: "place" | "venue";
};

/** อ่านเงื่อนไขบัญชีผู้สอบได้ (?round= &unit= &place= &venue= &by=) รอบที่เลือกได้: ประกาศผลแล้ว (ส่วนกลางเห็นรอบที่ยังเป็นร่างด้วย) */
export async function readPassListParams(raw: Raw, canManage: boolean): Promise<PassListParams> {
  const all = await fetchExamRounds();
  const rounds = all.filter((r) => r.is_active && r.status !== "draft" && (canManage || r.result_status === "published"));
  const wanted = read(raw, "round");
  const round = rounds.find((r) => r.id === wanted) ?? rounds[0] ?? null;
  const pick = (k: string) => (isUuid(read(raw, k)) ? read(raw, k) : null);
  return { rounds, round, unit: pick("unit"), place: pick("place"), venue: pick("venue"), by: read(raw, "by") === "venue" ? "venue" : "place" };
}

export function passListQuery(p: { round: ExamRound | null; unit?: string | null; place?: string | null; venue?: string | null; by?: string }) {
  const q = new URLSearchParams();
  if (p.round) q.set("round", p.round.id);
  if (p.unit) q.set("unit", p.unit);
  if (p.place) q.set("place", p.place);
  if (p.venue) q.set("venue", p.venue);
  if (p.by === "venue") q.set("by", "venue");
  return q.toString();
}
