import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, FileText, Plus } from "lucide-react";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { VenueStatusBadge } from "@/components/venue-status-badge";
import { requireMenu } from "@/lib/auth/guards";
import { explainError } from "@/lib/errors";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { fetchCivilProvinces } from "@/lib/places-server";
import { cn } from "@/lib/utils";
import { VENUE_STATUSES, VENUE_STATUS_LABEL, VENUE_TYPES, VENUE_TYPE_LABEL, venueLevelsText } from "@/lib/venues";
import { fetchAcademicYears, fetchVenueAlerts, pickYear, queryVenues, venuesTableParams } from "@/lib/venues-server";

import { UnitFilter } from "../../personnel/unit-filter";
import { CopyOfficersButton } from "./copy-button";

export const metadata: Metadata = { title: "ทะเบียนสนามสอบ" };
export const dynamic = "force-dynamic";

const BASE = "/app/places/venues";

function Officer({ name, status, personType, missing }: { name: string | null; status: string | null; personType: string | null; missing: boolean }) {
  if (!name) {
    return missing ? (
      <span className="inline-flex items-center gap-1 font-semibold text-destructive" data-testid="officer-missing">
        <AlertTriangle aria-hidden className="size-4" />
        ยังไม่มี
      </span>
    ) : (
      <span className="text-muted-foreground">-</span>
    );
  }
  return (
    <div>
      {name}
      {status && status !== "active" ? (
        <span className="mt-0.5 block">
          {status === "inactive" ? (
            <span className="rounded-full border border-red-300 bg-red-100 px-3 py-0.5 text-sm font-semibold text-red-900">
              ถูกปิดใช้งานในทะเบียนบุคคล
            </span>
          ) : (
            <StatusBadge status={status} personType={personType ?? "monastic"} />
          )}
        </span>
      ) : null}
    </div>
  );
}

export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/places");
  const query = await searchParams;
  const params = venuesTableParams(query);
  const [years, units, provinces] = await Promise.all([fetchAcademicYears(), fetchAccessibleUnits(), fetchCivilProvinces()]);
  const year = pickYear(years, typeof query.year === "string" ? query.year : null);
  const unitId = params.filters.unit ?? "";
  const [table, alerts] = year
    ? await Promise.all([queryVenues(year.id, params), fetchVenueAlerts(year.id, unitId || null, params.filters.type ?? null)])
    : [{ rows: [], total: 0, error: null }, null];
  const canEdit = ctx.canEditVenues;

  /** ลิงก์ที่คงตัวกรองเขตและประเภทไว้ แล้วเปลี่ยนค่าที่ระบุ */
  const link = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    if (year) next.set("year", String(year.year_be));
    if (unitId) next.set("f_unit", unitId);
    if (params.filters.type) next.set("f_type", params.filters.type);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    return `${BASE}?${next.toString()}`;
  };

  const rows: DataTableRow[] = table.rows.map((v) => ({
    id: v.id,
    cells: [
      v.code,
      <div key="name">
        <Link href={`${BASE}/${v.id}${year ? `?year=${year.year_be}` : ""}`} className="font-semibold text-primary underline underline-offset-4">
          {v.name}
        </Link>
        <span className="block text-sm text-muted-foreground">
          {VENUE_TYPE_LABEL[v.venue_type]} · {venueLevelsText(v.levels)}
        </span>
      </div>,
      <div key="place">
        {v.place_name}
        <span className="block text-sm text-muted-foreground">
          {[v.district_name ? `${v.district_prefix ?? ""}${v.district_name}` : "", v.province_name ?? ""].filter(Boolean).join(" ")}
        </span>
      </div>,
      v.org_unit_name,
      <Officer key="chair" name={v.chair_name} status={v.chair_status} personType={v.chair_person_type} missing={v.missing_chair} />,
      <Officer
        key="receiver"
        name={v.receiver_name}
        status={v.receiver_status}
        personType={v.receiver_person_type}
        missing={v.missing_receiver}
      />,
      <div key="status">
        <VenueStatusBadge status={v.status} isActive={v.is_active} />
        {v.status === "moved" && v.moved_to_name ? (
          <span className="mt-0.5 block text-sm text-muted-foreground">ไป {v.moved_to_name}</span>
        ) : null}
      </div>,
    ],
  }));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/places" className="text-primary underline underline-offset-4">
          ← ทะเบียนสถานที่
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">ทะเบียนสนามสอบ</h1>
          <p className="mt-1 text-muted-foreground">
            สนามสอบนักธรรมและธรรมศึกษา พร้อมประธานสนามสอบและผู้รับข้อสอบของแต่ละปีการศึกษา ในเขตที่ท่านดูแล
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {year ? (
            <Button asChild variant="outline">
              <Link href={`${BASE}/report?year=${year.year_be}${unitId ? `&unit=${unitId}` : ""}`}>
                <FileText aria-hidden />
                รายงานบัญชีสนามสอบ
              </Link>
            </Button>
          ) : null}
          {canEdit && year ? <CopyOfficersButton yearId={year.id} yearBe={year.year_be} unitId={unitId || null} /> : null}
          {canEdit ? (
            <Button asChild>
              <Link href={`${BASE}/new`}>
                <Plus aria-hidden />
                เพิ่มสนามสอบ
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {!ctx.canViewVenues ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">
          บทบาทของท่านยังไม่มีสิทธิ์ดูทะเบียนสนามสอบ (ผู้ดูแลระบบกำหนดได้ที่หน้า สิทธิ์ตามบทบาท)
        </p>
      ) : !year ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">
          ยังไม่มีปีการศึกษาในระบบ ผู้ดูแลระบบเพิ่มได้ที่หน้า บทบาทและค่าตั้ง
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <nav aria-label="เลือกปีการศึกษา" className="flex flex-wrap items-center gap-2" data-testid="venue-years">
            <span className="font-semibold">ปีการศึกษา:</span>
            {years.map((y) => (
              <Link
                key={y.id}
                href={link({ year: String(y.year_be) })}
                aria-current={y.id === year.id ? "page" : undefined}
                className={cn(
                  "rounded-md border px-3 py-1.5",
                  y.id === year.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                )}
              >
                {y.year_be}
                {y.is_current ? " (ปีปัจจุบัน)" : ""}
              </Link>
            ))}
          </nav>

          {alerts && (alerts.missing_chair > 0 || alerts.missing_receiver > 0 || alerts.status_changed > 0) ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950"
              data-testid="venue-alerts"
            >
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle aria-hidden className="size-5" />
                สนามสอบที่ต้องดำเนินการ ปีการศึกษา {year.year_be}
              </p>
              <ul className="mt-1 list-disc pl-6">
                {alerts.missing_chair > 0 || alerts.missing_receiver > 0 ? (
                  <li>
                    ยังไม่มีประธานสนามสอบ {alerts.missing_chair.toLocaleString("th-TH")} สนาม และยังไม่มีผู้รับข้อสอบ{" "}
                    {alerts.missing_receiver.toLocaleString("th-TH")} สนาม (จากสนามที่เปิดอยู่{" "}
                    {alerts.open_total.toLocaleString("th-TH")} สนาม){" "}
                    <Link href={link({ f_alert: "missing" })} className="font-semibold underline underline-offset-4">
                      แสดงเฉพาะสนามเหล่านี้
                    </Link>
                  </li>
                ) : null}
                {alerts.status_changed > 0 ? (
                  <li>
                    มีประธานหรือผู้รับข้อสอบที่สถานะในทะเบียนบุคคลเปลี่ยนไป {alerts.status_changed.toLocaleString("th-TH")} สนาม{" "}
                    <Link href={link({ f_alert: "changed" })} className="font-semibold underline underline-offset-4">
                      แสดงเฉพาะสนามเหล่านี้
                    </Link>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : alerts && alerts.open_total > 0 ? (
            <p className="rounded-xl border border-green-300 bg-green-50 p-4 text-green-900" data-testid="venue-alerts-ok">
              สนามสอบที่เปิดอยู่ทั้ง {alerts.open_total.toLocaleString("th-TH")} สนาม มีประธานสนามสอบและผู้รับข้อสอบของปีการศึกษา{" "}
              {year.year_be} ครบแล้ว
            </p>
          ) : null}

          {table.error ? <ErrorText>{explainError(table.error)}</ErrorText> : null}
          <UnitFilter units={units} value={unitId} />
          <DataTable
            key={year.id}
            columns={[
              { key: "code", header: "รหัส", sortable: true },
              { key: "name", header: "สนามสอบ", sortable: true },
              { key: "place", header: "สถานที่ตั้ง" },
              { key: "unit", header: "เขตคณะสงฆ์", sortable: true },
              { key: "chair", header: "ประธานสนามสอบ" },
              { key: "receiver", header: "ผู้รับข้อสอบ" },
              { key: "status", header: "สถานะ", sortable: true },
            ]}
            rows={rows}
            total={table.total}
            page={params.page}
            pageSize={params.pageSize}
            sort={params.sort}
            dir={params.dir}
            q={params.q}
            searchPlaceholder="ค้นหาชื่อ รหัส หรือสถานที่ตั้ง"
            filters={[
              { name: "type", label: "ประเภท", options: VENUE_TYPES.map((t) => ({ value: t as string, label: VENUE_TYPE_LABEL[t] })) },
              { name: "province", label: "จังหวัด", options: provinces.map((p) => ({ value: String(p.code), label: p.name })) },
              {
                name: "status",
                label: "สถานะ",
                options: [
                  ...VENUE_STATUSES.map((s) => ({ value: s as string, label: VENUE_STATUS_LABEL[s] })),
                  { value: "inactive", label: "ปิดใช้งาน (บันทึกผิด)" },
                ],
              },
              {
                name: "alert",
                label: "การเตือน",
                options: [
                  { value: "missing", label: "ยังไม่มีประธานหรือผู้รับข้อสอบ" },
                  { value: "changed", label: "สถานะบุคคลเปลี่ยน" },
                ],
              },
            ]}
            filterValues={params.filters}
            emptyText="ไม่พบสนามสอบตามเงื่อนไขนี้"
          />
        </div>
      )}
    </section>
  );
}
