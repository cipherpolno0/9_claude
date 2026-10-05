import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { explainError } from "@/lib/errors";
import {
  DEFAULT_STEP_DAYS,
  PLACE_REQUEST_LABEL,
  PLACE_REQUEST_TYPES,
  SAMNAK_TYPE_LABEL,
  isSamnakType,
} from "@/lib/place-requests";
import {
  fetchPlaceRequestCounts,
  isRequestTab,
  placeRequestParams,
  queryPlaceRequests,
  remindOverduePlaceRequests,
  type RequestTab,
} from "@/lib/place-requests-server";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/labels";
import { findWorkspaceMenu } from "@/lib/site";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

const menu = findWorkspaceMenu("/app/requests");

export const metadata: Metadata = { title: menu.title };
export const dynamic = "force-dynamic";

const TAB_LABEL: Record<RequestTab, string> = {
  mine: "คำขอของฉัน",
  pending: "รอพิจารณา",
  area: "ทั้งหมดในเขต",
};
const EMPTY: Record<RequestTab, string> = {
  mine: "ท่านยังไม่เคยยื่นคำขอจัดตั้งหรือขอยุบสำนัก",
  pending: "ไม่มีคำขอรอท่านพิจารณา",
  area: "ไม่พบคำขอในเขตที่ท่านดูแลตามเงื่อนไขนี้",
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu(menu.href);
  const raw = await searchParams;
  const rawTab = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
  const params = placeRequestParams(raw);
  const days = ctx.settings.place_request_step_days ?? DEFAULT_STEP_DAYS;

  // แจ้งเตือนผู้พิจารณาของขั้นที่เกินกำหนด (ไม่เกินวันละ 1 ครั้งต่อขั้น) แล้วจึงอ่านรายการ
  await remindOverduePlaceRequests();
  const counts = await fetchPlaceRequestCounts();
  // ไม่ระบุแท็บ: ถ้ามีงานรอพิจารณาให้เปิดแท็บนั้นก่อน
  const tab: RequestTab = isRequestTab(rawTab) ? rawTab : counts.pending > 0 ? "pending" : ctx.canEditPlaces ? "mine" : "area";
  const table = await queryPlaceRequests(tab, params);

  const rows: DataTableRow[] = table.rows.map((r) => ({
    id: r.id,
    cells: [
      <Link key="no" href={`/app/approvals/${r.id}`} className="font-semibold whitespace-nowrap text-primary underline underline-offset-4">
        {r.request_no}
      </Link>,
      <div key="type" className="whitespace-nowrap">
        {PLACE_REQUEST_LABEL[r.type_key]}
        {isSamnakType(r.place_type) ? (
          <span className="block text-sm text-muted-foreground">{SAMNAK_TYPE_LABEL[r.place_type]}</span>
        ) : null}
      </div>,
      <div key="name">
        {r.subject_name ?? r.title}
        {r.temple_name ? <span className="block text-sm text-muted-foreground">{r.temple_name}</span> : null}
      </div>,
      r.org_unit_name,
      thaiDate(r.submitted_at, "short"),
      <div key="status">
        {REQUEST_STATUS_LABEL[r.status]}
        {r.status === "pending" && r.current_unit_name ? (
          <span className="block text-sm text-muted-foreground">
            ขั้นที่ {r.current_step} จาก {r.step_count} · รอที่ {r.current_unit_name}
          </span>
        ) : null}
      </div>,
      r.status === "pending" && r.due_at ? (
        <div key="due">
          {thaiDate(r.due_at, "short")}
          {r.overdue_days > 0 ? (
            <span
              data-testid="overdue-badge"
              className="mt-0.5 block w-fit rounded border border-destructive px-2 py-0.5 text-sm font-semibold text-destructive"
            >
              เกินกำหนด {r.overdue_days} วัน
            </span>
          ) : null}
        </div>
      ) : (
        "-"
      ),
    ],
  }));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
          <p className="mt-1 text-muted-foreground">
            คำขอจัดตั้งและขอยุบ สำนักเรียน สำนักศาสนศึกษา พิจารณาตามลำดับชั้นจากเขตของวัดที่ตั้งขึ้นไปถึงส่วนกลาง
            ชั้นละไม่เกิน {days} วัน
          </p>
        </div>
        {ctx.canEditPlaces ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/app/requests/new?type=establish">
                <Plus aria-hidden />
                ยื่นคำขอจัดตั้ง
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/requests/new?type=dissolve">ยื่นคำขอยุบ</Link>
            </Button>
          </div>
        ) : null}
      </div>

      {counts.pending_overdue > 0 ? (
        <div className="mt-4" data-testid="overdue-alert">
          <ErrorText>
            มีคำขอรอท่านพิจารณาที่เกินกำหนด {days} วันแล้ว {counts.pending_overdue} รายการ กรุณาพิจารณาโดยเร็ว
          </ErrorText>
        </div>
      ) : null}

      <nav aria-label="กลุ่มคำขอ" className="mt-6 flex flex-wrap gap-1 border-b" data-testid="request-tabs">
        {(["mine", "pending", "area"] as RequestTab[]).map((t) => (
          <Link
            key={t}
            href={`/app/requests?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "rounded-t-md border border-b-0 px-4 py-2 font-semibold",
              t === tab ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {TAB_LABEL[t]}
            <span className={cn("ml-2 text-sm font-normal", t === tab ? "text-primary-foreground/90" : "text-muted-foreground")}>
              {counts[t].toLocaleString("th-TH")}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-4">
        {table.error ? <ErrorText>{explainError(table.error)}</ErrorText> : null}
        <DataTable
          columns={[
            { key: "no", header: "เลขที่", sortable: true },
            { key: "type", header: "ชนิด" },
            { key: "name", header: "สำนัก / วัดที่ตั้ง" },
            { key: "unit", header: "เขตคณะสงฆ์" },
            { key: "submitted", header: "วันที่ยื่น", sortable: true },
            { key: "status", header: "สถานะ", sortable: true },
            { key: "due", header: "ครบกำหนดพิจารณา", sortable: true },
          ]}
          rows={rows}
          total={table.total}
          page={params.page}
          pageSize={params.pageSize}
          sort={params.sort}
          dir={params.dir}
          q={params.q}
          searchPlaceholder="ค้นหาเลขที่ ชื่อสำนัก หรือวัดที่ตั้ง"
          filters={[
            {
              name: "type",
              label: "ชนิด",
              options: PLACE_REQUEST_TYPES.map((t) => ({ value: t as string, label: PLACE_REQUEST_LABEL[t] })),
            },
            {
              name: "status",
              label: "สถานะ",
              options: Object.entries(REQUEST_STATUS_LABEL).map(([value, label]) => ({ value, label })),
            },
          ]}
          filterValues={params.filters}
          emptyText={EMPTY[tab]}
        />
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        คำขอชนิดอื่น (เช่น คำขอของทะเบียนบุคคล) ดูได้ที่{" "}
        <Link href="/app/approvals" className="text-primary underline underline-offset-4">
          งานรอพิจารณาและคำขอของท่าน
        </Link>
      </p>
    </section>
  );
}
