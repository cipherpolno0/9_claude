import type { Metadata } from "next";
import Link from "next/link";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { requireMenu } from "@/lib/auth/guards";
import { SCHOOL_TYPE_LABEL, STAFF_STATUSES, STAFF_STATUS_LABEL, TRACKS, TRACK_LABEL, isTrack, type Track } from "@/lib/education";
import {
  educationTableParams,
  fetchEducationCounts,
  fetchEducationSchools,
  queryEducationStaff,
} from "@/lib/education-server";
import { explainError } from "@/lib/errors";
import { LEVEL_LABEL } from "@/lib/org-units";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { personName } from "@/lib/persons";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { UnitFilter } from "../unit-filter";

export const metadata: Metadata = { title: "ทะเบียน จศป." };
export const dynamic = "force-dynamic";

export default async function EducationStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/personnel");
  const raw = await searchParams;
  const track: Track = isTrack(raw.track) ? raw.track : "dhamma";
  const params = educationTableParams(raw);
  const [table, units, counts, schools] = await Promise.all([
    queryEducationStaff(track, params),
    fetchAccessibleUnits(),
    fetchEducationCounts(track, params.filters.unit ?? null),
    fetchEducationSchools(track),
  ]);
  const totalActive = counts.reduce((sum, c) => sum + c.staff_count, 0);

  const rows: DataTableRow[] = table.rows.map((e) => ({
    id: e.id,
    cells: [
      <Link
        key="name"
        href={`/app/personnel/${e.person_id}?tab=education`}
        className="font-semibold text-primary underline underline-offset-4"
      >
        {personName(e)}
      </Link>,
      e.position_name,
      <>
        {e.school_name || "-"}
        {e.school_type ? <span className="block text-sm text-muted-foreground">{SCHOOL_TYPE_LABEL[e.school_type]}</span> : null}
      </>,
      e.org_unit_name,
      e.subjects || "-",
      thaiDate(e.started_on, "short"),
      e.is_active ? STAFF_STATUS_LABEL[e.status] : "ยกเลิก",
    ],
  }));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/personnel" className="text-primary underline underline-offset-4">
          ← ทะเบียนบุคคล
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ทะเบียน จศป.</h1>
      <p className="mt-1 text-muted-foreground">
        จศป. ในเขตที่ท่านดูแล แยกตามแท่ง การเพิ่มและแก้ไขทำที่หน้าประวัติรายบุคคล แท็บ จศป.
      </p>

      <nav aria-label="แท่ง" className="mt-6 flex flex-wrap gap-1 border-b">
        {TRACKS.map((t) => (
          <Link
            key={t}
            href={`/app/personnel/education?track=${t}`}
            aria-current={track === t ? "page" : undefined}
            className={cn(
              "rounded-t-md border border-b-0 px-4 py-2 font-semibold",
              track === t ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {TRACK_LABEL[t]}
          </Link>
        ))}
      </nav>

      <div className="mt-6 flex flex-col gap-4">
        {table.error ? <ErrorText>{explainError(table.error)}</ErrorText> : null}
        <UnitFilter units={units} value={params.filters.unit ?? ""} />

        <div className="rounded-xl border bg-card p-4" data-testid="education-counts">
          <h2 className="text-lg font-bold text-primary">
            จำนวน จศป. {TRACK_LABEL[track]} ที่ปฏิบัติหน้าที่อยู่: {totalActive.toLocaleString("th-TH")} รูป/คน
          </h2>
          {counts.length === 0 ? (
            <p className="text-muted-foreground">ยังไม่มี จศป. ในแท่งนี้</p>
          ) : (
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {counts.map((c) => (
                <li key={c.org_unit_id} className="flex justify-between gap-3 border-b py-1">
                  <span>
                    <span className="mr-2 rounded bg-accent px-1.5 py-0.5 text-sm font-semibold">{LEVEL_LABEL[c.level]}</span>
                    {c.org_unit_name}
                  </span>
                  <span className="font-semibold">{c.staff_count.toLocaleString("th-TH")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DataTable
          columns={[
            { key: "name", header: "ชื่อ", sortable: true },
            { key: "position", header: "ประเภทตำแหน่ง" },
            { key: "school", header: "สำนัก", sortable: true },
            { key: "unit", header: "เขตที่รับผิดชอบ", sortable: true },
            { key: "subjects", header: "วิชาที่สอน" },
            { key: "started", header: "วันที่เริ่ม", sortable: true },
            { key: "status", header: "สถานะ" },
          ]}
          rows={rows}
          total={table.total}
          page={params.page}
          pageSize={params.pageSize}
          sort={params.sort}
          dir={params.dir}
          q={params.q}
          searchPlaceholder="ค้นหาชื่อ สำนัก หรือวิชา"
          filters={[
            { name: "school", label: "สำนัก", options: schools.map((s) => ({ value: s, label: s })) },
            {
              name: "status",
              label: "สถานะ",
              options: [
                ...STAFF_STATUSES.map((s) => ({ value: s as string, label: STAFF_STATUS_LABEL[s] })),
                { value: "inactive", label: "ยกเลิก (บันทึกผิด)" },
              ],
            },
          ]}
          filterValues={params.filters}
          exportHref="/app/personnel/education/export"
          emptyText="ไม่พบ จศป. ตามเงื่อนไขนี้"
        />
      </div>
    </section>
  );
}
