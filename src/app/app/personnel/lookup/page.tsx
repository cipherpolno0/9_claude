import type { Metadata } from "next";
import Link from "next/link";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { requireMenu } from "@/lib/auth/guards";
import { TRACKS, TRACK_LABEL } from "@/lib/education";
import { explainError } from "@/lib/errors";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { PERSON_STATUSES, PERSON_STATUS_LABEL, personName } from "@/lib/persons";
import { fetchPositionTypes } from "@/lib/persons-server";
import { educationLines, lookupTableParams, queryLookup } from "@/lib/reports-server";

import { UnitFilter } from "../unit-filter";
import { TimelineButton } from "./timeline-button";

export const metadata: Metadata = { title: "ตรวจสอบบุคลากร" };
export const dynamic = "force-dynamic";

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/personnel");
  const params = lookupTableParams(await searchParams);
  const [table, units, positions] = await Promise.all([queryLookup(params), fetchAccessibleUnits(), fetchPositionTypes()]);

  const rows: DataTableRow[] = table.rows.map((p) => {
    const name = personName(p);
    const education = educationLines(p.education);
    return {
      id: p.id,
      cells: [
        <Link key="name" href={`/app/personnel/${p.id}`} className="font-semibold text-primary underline underline-offset-4">
          {name}
        </Link>,
        p.positions || education.length ? (
          <div key="positions" className="whitespace-pre-line">
            {p.positions}
            {education.map((line) => (
              <span key={line} className="block text-sm text-muted-foreground">
                {line}
              </span>
            ))}
          </div>
        ) : (
          "-"
        ),
        <div key="unit">
          {p.temple_name || "-"}
          <span className="block text-sm text-muted-foreground">{p.org_unit_name}</span>
        </div>,
        <StatusBadge key="status" status={p.status} personType={p.person_type} />,
        <TimelineButton key="timeline" personId={p.id} name={name} />,
      ],
    };
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/personnel" className="text-primary underline underline-offset-4">
          ← กลับไปทะเบียนบุคคล
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ตรวจสอบบุคลากร</h1>
      <p className="mt-1 text-muted-foreground">
        ค้นด้วยชื่อ ฉายา หรือนามสกุล กรองตามตำแหน่ง เขต แท่ง และสถานะ กดปุ่ม เส้นเวลา เพื่อดูประวัติการเปลี่ยนสถานะ
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {table.error ? <ErrorText>{explainError(table.error)}</ErrorText> : null}
        <UnitFilter units={units} value={params.filters.unit ?? ""} />
        <DataTable
          columns={[
            { key: "name", header: "ชื่อ", sortable: true },
            { key: "positions", header: "ตำแหน่งปัจจุบัน" },
            { key: "unit", header: "วัดที่สังกัด / เขต", sortable: true },
            { key: "status", header: "สถานะ", sortable: true },
            { key: "timeline", header: "เส้นเวลา" },
          ]}
          rows={rows}
          total={table.total}
          page={params.page}
          pageSize={params.pageSize}
          sort={params.sort}
          dir={params.dir}
          q={params.q}
          searchPlaceholder="ค้นหาชื่อ ฉายา หรือนามสกุล"
          filters={[
            {
              name: "position",
              label: "ตำแหน่งปกครอง",
              options: positions.filter((t) => t.is_active).map((t) => ({ value: t.key, label: t.name })),
            },
            { name: "track", label: "แท่ง จศป.", options: TRACKS.map((t) => ({ value: t as string, label: TRACK_LABEL[t] })) },
            {
              name: "status",
              label: "สถานะ",
              options: PERSON_STATUSES.map((s) => ({ value: s as string, label: PERSON_STATUS_LABEL[s] })),
            },
          ]}
          filterValues={params.filters}
          emptyText="ไม่พบบุคคลตามเงื่อนไขนี้"
        />
      </div>
    </section>
  );
}
