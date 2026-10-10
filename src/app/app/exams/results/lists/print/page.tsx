import type { Metadata } from "next";

import { requireMenu } from "@/lib/auth/guards";
import { passSections } from "@/lib/exam-results";
import { fetchPassList, fetchResultForms } from "@/lib/exam-results-server";

import { passListQuery, readPassListParams } from "../params";
import { PassPrintSheet } from "./print-sheet";

export const metadata: Metadata = { title: "พิมพ์บัญชีผู้สอบได้" };
export const dynamic = "force-dynamic";

/** หน้าพิมพ์บัญชีผู้สอบได้ ศ.๔ ศ.๘: A4 แนวตั้งตามแบบจริง เลขไทย หนึ่งบัญชีต่อหน้า */
export default async function PassListPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireMenu("/app/exams");
  const p = await readPassListParams(await searchParams, ctx.canManageExamRounds);
  if (!p.round || (!p.place && !p.venue)) {
    return <p className="p-6 text-muted-foreground">กรุณาเลือกรอบ และสนามสอบหรือสำนัก จากหน้า บัญชีผู้สอบได้ ก่อน</p>;
  }
  const [rows, forms] = await Promise.all([fetchPassList(p.round.id, p.unit, p.place, p.venue), fetchResultForms()]);
  const round = p.round;
  return (
    <PassPrintSheet
      sections={passSections(rows, round.exam_type, round.level, p.by)}
      form={forms.find((f) => f.exam_type === round.exam_type) ?? null}
      type={round.exam_type}
      year={round.year_be}
      announcedOn={round.results_announced_on ?? null}
      draft={round.result_status !== "published"}
      backHref={`/app/exams/results/lists?${passListQuery(p)}`}
    />
  );
}
