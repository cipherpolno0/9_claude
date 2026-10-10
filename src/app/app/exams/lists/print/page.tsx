import type { Metadata } from "next";

import { requireMenu } from "@/lib/auth/guards";
import { groupByVenue } from "@/lib/exam-lists";
import { fetchList } from "@/lib/exam-lists-server";

import { listQuery, readListParams } from "../params";
import { ListPrintSheet } from "./print-sheet";

export const metadata: Metadata = { title: "พิมพ์บัญชี ศ." };
export const dynamic = "force-dynamic";

/** หน้าพิมพ์บัญชีรายชื่อตามแบบ ศ.: A4 แนวนอน เลขไทย หนึ่งสนามสอบขึ้นหน้าใหม่ ช่องลงนามท้ายบัญชี */
export default async function ExamListPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/exams");
  const p = await readListParams(await searchParams);
  if (!p.year || !p.form || (!p.place && !p.venue)) {
    return <p className="p-6 text-muted-foreground">กรุณาเลือกปี แบบ ศ. และสนามสอบหรือสำนัก จากหน้า ตรวจรายชื่อและพิมพ์บัญชี ศ. ก่อน</p>;
  }
  const rows = await fetchList(p.year, p.form, p.unit, p.place, p.venue);
  return (
    <ListPrintSheet
      form={p.form}
      year={p.year}
      sections={groupByVenue(rows)}
      backHref={`/app/exams/lists?${listQuery(p)}`}
    />
  );
}
