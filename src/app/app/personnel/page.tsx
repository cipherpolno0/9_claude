import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { PERSON_STATUSES, PERSON_STATUS_LABEL, PERSON_TYPE_LABEL, personName, phansaOf } from "@/lib/persons";
import { fetchPositionTypes, isPersonnelEditor, personnelTableParams, queryPersonnel } from "@/lib/persons-server";
import { findWorkspaceMenu } from "@/lib/site";
import { explainError } from "@/lib/errors";

import { ImportButton } from "./import-button";
import { UnitFilter } from "./unit-filter";

const menu = findWorkspaceMenu("/app/personnel");

export const metadata: Metadata = { title: menu.title };
export const dynamic = "force-dynamic";

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu(menu.href);
  const params = personnelTableParams(await searchParams);
  const [table, units, positions] = await Promise.all([
    queryPersonnel(params),
    fetchAccessibleUnits(),
    fetchPositionTypes(),
  ]);
  const canEdit = isPersonnelEditor(ctx);

  const rows: DataTableRow[] = table.rows.map((p) => {
    const phansa = p.person_type === "monastic" && p.status === "active" ? phansaOf(p.ordination_date) : null;
    return {
      id: p.id,
      cells: [
        <Link key="name" href={`/app/personnel/${p.id}`} className="font-semibold text-primary underline underline-offset-4">
          {personName(p)}
        </Link>,
        PERSON_TYPE_LABEL[p.person_type],
        <>
          {p.temple_name || "-"}
          <span className="block text-sm text-muted-foreground">{p.org_unit_name}</span>
        </>,
        p.positions ? <span className="whitespace-pre-line">{p.positions}</span> : "-",
        phansa === null ? "-" : phansa,
        p.is_active ? PERSON_STATUS_LABEL[p.status] : "ปิดใช้งาน",
      ],
    };
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">ทะเบียนบุคคลและตำแหน่งปกครอง</h1>
          <p className="mt-1 text-muted-foreground">
            รายชื่อบุคคลในเขตที่ท่านดูแล กดที่ชื่อเพื่อดูประวัติ ตำแหน่ง และเอกสารแนบ
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href="/app/personnel/template" download>ดาวน์โหลดแม่แบบ Excel</a>
            </Button>
            <ImportButton />
            <Button asChild>
              <Link href="/app/personnel/new">
                <UserPlus aria-hidden />
                เพิ่มบุคคล
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {table.error ? <ErrorText>{explainError(table.error)}</ErrorText> : null}
        <UnitFilter units={units} value={params.filters.unit ?? ""} />
        <DataTable
          columns={[
            { key: "name", header: "ชื่อ", sortable: true },
            { key: "type", header: "ประเภท" },
            { key: "unit", header: "วัดที่สังกัด / เขต", sortable: true },
            { key: "positions", header: "ตำแหน่งปัจจุบัน" },
            { key: "ordination", header: "พรรษา", sortable: true },
            { key: "status", header: "สถานะ", sortable: true },
          ]}
          rows={rows}
          total={table.total}
          page={params.page}
          pageSize={params.pageSize}
          sort={params.sort}
          dir={params.dir}
          q={params.q}
          searchPlaceholder="ค้นหาชื่อ ฉายา นามสกุล หรือวัด"
          filters={[
            {
              name: "position",
              label: "ตำแหน่ง",
              options: positions.filter((t) => t.is_active).map((t) => ({ value: t.key, label: t.name })),
            },
            {
              name: "status",
              label: "สถานะ",
              options: [
                ...PERSON_STATUSES.map((s) => ({ value: s as string, label: PERSON_STATUS_LABEL[s] })),
                { value: "inactive", label: "ปิดใช้งาน (บันทึกผิด)" },
              ],
            },
          ]}
          filterValues={params.filters}
          exportHref="/app/personnel/export"
          emptyText="ไม่พบบุคคลตามเงื่อนไขนี้"
        />
      </div>
    </section>
  );
}
