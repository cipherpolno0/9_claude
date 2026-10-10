import type { Metadata } from "next";
import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { LIST_REPORT_KINDS, LIST_REPORT_LABEL } from "@/lib/exam-lists";
import { buildListReport } from "@/lib/exam-lists-server";
import { cn } from "@/lib/utils";

import { ReportView } from "../../../personnel/reports/report-view";
import { UnitFilter } from "../../../personnel/unit-filter";
import { listReportQuery, readListReportParams } from "./params";

export const metadata: Metadata = { title: "รายงานสรุปผู้สมัครสอบ" };
export const dynamic = "force-dynamic";

const BASE = "/app/exams/lists/report";

export default async function ListReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/exams");
  const { kind, years, year, units, unit } = await readListReportParams(await searchParams);
  const report = year && unit ? await buildListReport(kind, year, unit) : null;
  const query = listReportQuery(kind, year, unit?.id);
  const chip = (active: boolean) =>
    cn("rounded-md border px-3 py-1.5", active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>{" "}
        /{" "}
        <Link href="/app/exams/lists" className="text-primary underline underline-offset-4">
          ตรวจรายชื่อและพิมพ์บัญชี ศ.
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">รายงานสรุปผู้สมัครสอบ</h1>
      <p className="mt-1 text-muted-foreground">จำนวนผู้สมัครต่อแบบ ศ. ต่อเขต และรายชื่อที่สมัครซ้ำข้ามสำนักในปีเดียวกัน เฉพาะบัญชีที่ท่านมีสิทธิ์เห็น</p>

      {!year || !unit ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">ยังไม่มีรอบสมัครสอบ หรือบัญชีของท่านยังไม่มีเขตปกครอง</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <nav aria-label="เลือกรายงาน" className="flex flex-wrap items-center gap-2" data-testid="report-kinds">
            <span className="font-semibold">รายงาน:</span>
            {LIST_REPORT_KINDS.map((k) => (
              <Link key={k} href={`${BASE}?${listReportQuery(k, year, unit.id)}`} aria-current={k === kind ? "page" : undefined} className={chip(k === kind)}>
                {LIST_REPORT_LABEL[k]}
              </Link>
            ))}
          </nav>
          <nav aria-label="เลือกปีการศึกษา" className="flex flex-wrap items-center gap-2" data-testid="report-years">
            <span className="font-semibold">ปีการศึกษา:</span>
            {years.map((y) => (
              <Link key={y} href={`${BASE}?${listReportQuery(kind, y, unit.id)}`} aria-current={y === year ? "page" : undefined} className={chip(y === year)}>
                {y}
              </Link>
            ))}
          </nav>
          <UnitFilter units={units} value={unit.id} param="unit" currentName={unit.name} applyLabel="แสดงรายงานของเขตนี้" allowClear={false} />

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`${BASE}/export?${query}`} download>
                <Download aria-hidden />
                ส่งออก Excel
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${BASE}/print?${query}`} target="_blank" prefetch={false}>
                <Printer aria-hidden />
                หน้าพิมพ์
              </Link>
            </Button>
          </div>

          {report ? <ReportView report={report} /> : null}
        </div>
      )}
    </section>
  );
}
