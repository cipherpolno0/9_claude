import type { Metadata } from "next";
import Link from "next/link";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { requireMenu } from "@/lib/auth/guards";
import { explainError } from "@/lib/errors";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/requests/labels";
import { PERSONNEL_REQUEST_TYPES, isNoticeType, statusTypeLabel } from "@/lib/status";
import { personnelRequestParams, queryPersonnelRequests } from "@/lib/status-server";
import { thaiDate } from "@/lib/thai";

export const metadata: Metadata = { title: "คำขอและการแจ้งของทะเบียนบุคคล" };
export const dynamic = "force-dynamic";

export default async function PersonnelRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/personnel");
  const params = personnelRequestParams(await searchParams);
  const table = await queryPersonnelRequests(params);

  const rows: DataTableRow[] = table.rows.map((r) => ({
    id: r.id,
    cells: [
      <Link key="no" href={`/app/approvals/${r.id}`} className="font-semibold text-primary underline underline-offset-4">
        {r.request_no}
      </Link>,
      statusTypeLabel(r.type_key),
      r.person_name ?? r.title,
      r.org_unit_name,
      thaiDate(r.effective_on, "short"),
      thaiDate(r.submitted_at, "short"),
      <div key="status">
        {isNoticeType(r.type_key) && r.status === "approved" ? "รับทราบแล้ว" : REQUEST_STATUS_LABEL[r.status as RequestStatus]}
        {r.current_unit_name && r.status === "pending" ? (
          <span className="block text-sm text-muted-foreground">รอที่ {r.current_unit_name}</span>
        ) : null}
      </div>,
    ],
  }));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/personnel" className="text-primary underline underline-offset-4">
          ← ทะเบียนบุคคล
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">คำขอและการแจ้งของทะเบียนบุคคล</h1>
      <p className="mt-1 text-muted-foreground">
        คำขอย้าย ลาออก แก้ไขประวัติ และการแจ้งมรณภาพ-ตาย ลาสิกขา พ้นตำแหน่งด้วยเหตุอื่น ในเขตที่ท่านดูแล
        การยื่นและการแจ้งทำที่หน้าประวัติรายบุคคล แท็บ สถานะ
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {table.error ? <ErrorText>{explainError(table.error)}</ErrorText> : null}
        <DataTable
          columns={[
            { key: "no", header: "เลขที่", sortable: true },
            { key: "type", header: "ชนิด" },
            { key: "person", header: "บุคคล" },
            { key: "unit", header: "หน่วยต้นสังกัด" },
            { key: "effective", header: "วันที่มีผล" },
            { key: "submitted", header: "วันที่ยื่น", sortable: true },
            { key: "status", header: "สถานะ", sortable: true },
          ]}
          rows={rows}
          total={table.total}
          page={params.page}
          pageSize={params.pageSize}
          sort={params.sort}
          dir={params.dir}
          q={params.q}
          searchPlaceholder="ค้นหาเลขที่หรือชื่อบุคคล"
          filters={[
            {
              name: "type",
              label: "ชนิด",
              options: PERSONNEL_REQUEST_TYPES.map((t) => ({ value: t as string, label: statusTypeLabel(t) })),
            },
            {
              name: "status",
              label: "สถานะ",
              options: Object.entries(REQUEST_STATUS_LABEL).map(([value, label]) => ({ value, label })),
            },
          ]}
          filterValues={params.filters}
          emptyText="ไม่พบคำขอหรือการแจ้งตามเงื่อนไขนี้"
        />
      </div>
    </section>
  );
}
