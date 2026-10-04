import type { Metadata } from "next";
import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { cn } from "@/lib/utils";
import { VENUE_TYPES, VENUE_TYPE_LABEL } from "@/lib/venues";
import { buildVenueReport } from "@/lib/venues-server";

import { ReportView } from "../../../personnel/reports/report-view";
import { UnitFilter } from "../../../personnel/unit-filter";
import { readVenueReportParams, venueReportQuery } from "./params";

export const metadata: Metadata = { title: "รายงานบัญชีสนามสอบ" };
export const dynamic = "force-dynamic";

const BASE = "/app/places/venues/report";

export default async function VenueReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/places");
  const { years, year, type, unit } = await readVenueReportParams(await searchParams);
  const [units, report] = await Promise.all([
    fetchAccessibleUnits(),
    year && ctx.canViewVenues ? buildVenueReport(year, unit, type) : null,
  ]);
  const query = venueReportQuery(year?.year_be, unit?.id, type);
  const chip = (active: boolean) =>
    cn("rounded-md border px-3 py-1.5", active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/places/venues${year ? `?year=${year.year_be}` : ""}`} className="text-primary underline underline-offset-4">
          ← ทะเบียนสนามสอบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">รายงานบัญชีสนามสอบ</h1>
      <p className="mt-1 text-muted-foreground">
        สนามสอบที่เปิดอยู่ พร้อมประธานสนามสอบ ผู้รับข้อสอบ ที่อยู่จัดส่งข้อสอบ และเบอร์ติดต่อ แยกตามจังหวัด
      </p>

      {!ctx.canViewVenues ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">
          บทบาทของท่านยังไม่มีสิทธิ์ดูทะเบียนสนามสอบ จึงไม่มีรายงานให้แสดง
        </p>
      ) : !year || !report ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">
          ยังไม่มีปีการศึกษาในระบบ ผู้ดูแลระบบเพิ่มได้ที่หน้า บทบาทและค่าตั้ง
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <nav aria-label="เลือกปีการศึกษา" className="flex flex-wrap items-center gap-2" data-testid="report-years">
            <span className="font-semibold">ปีการศึกษา:</span>
            {years.map((y) => (
              <Link
                key={y.id}
                href={`${BASE}?${venueReportQuery(y.year_be, unit?.id, type)}`}
                aria-current={y.id === year.id ? "page" : undefined}
                className={chip(y.id === year.id)}
              >
                {y.year_be}
                {y.is_current ? " (ปีปัจจุบัน)" : ""}
              </Link>
            ))}
          </nav>
          <nav aria-label="เลือกประเภทสนามสอบ" className="flex flex-wrap items-center gap-2" data-testid="report-types">
            <span className="font-semibold">ประเภท:</span>
            <Link href={`${BASE}?${venueReportQuery(year.year_be, unit?.id, null)}`} aria-current={!type ? "page" : undefined} className={chip(!type)}>
              ทุกประเภท
            </Link>
            {VENUE_TYPES.map((t) => (
              <Link
                key={t}
                href={`${BASE}?${venueReportQuery(year.year_be, unit?.id, t)}`}
                aria-current={type === t ? "page" : undefined}
                className={chip(type === t)}
              >
                {VENUE_TYPE_LABEL[t]}
              </Link>
            ))}
          </nav>
          <UnitFilter units={units} value={unit?.id ?? ""} param="unit" applyLabel="แสดงรายงานของเขตนี้" />

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`${BASE}/export?${query}`} download>
                <Download aria-hidden />
                ส่งออก Excel
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${BASE}/print?${query}`} target="_blank">
                <Printer aria-hidden />
                หน้าพิมพ์
              </Link>
            </Button>
          </div>

          <ReportView report={report} />
        </div>
      )}
    </section>
  );
}
