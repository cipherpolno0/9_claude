import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { PlaceStatusBadge } from "@/components/place-status-badge";
import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { explainError } from "@/lib/errors";
import { SECT_LABEL } from "@/lib/org-units";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import {
  PLACE_STATUSES,
  PLACE_STATUS_LABEL,
  PLACE_TYPES,
  PLACE_TYPE_LABEL,
  isPlaceType,
  needsParentTemple,
  placeAddress,
  type PlaceType,
} from "@/lib/places";
import { fetchCivilProvinces, fetchPlaceTypeCounts, placesTableParams, queryPlaces } from "@/lib/places-server";
import { findWorkspaceMenu } from "@/lib/site";
import { cn } from "@/lib/utils";

import { UnitFilter } from "../personnel/unit-filter";
import { PlaceImportButton } from "./import-button";

const menu = findWorkspaceMenu("/app/places");

export const metadata: Metadata = { title: menu.title };
export const dynamic = "force-dynamic";

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu(menu.href);
  const query = await searchParams;
  const type: PlaceType = isPlaceType(query.type) ? query.type : "temple";
  const params = placesTableParams(query);
  const [table, counts, units, provinces] = await Promise.all([
    queryPlaces(type, params),
    fetchPlaceTypeCounts(),
    fetchAccessibleUnits(),
    fetchCivilProvinces(),
  ]);
  const canEdit = ctx.canEditPlaces;
  const samnak = needsParentTemple(type);
  const label = PLACE_TYPE_LABEL[type];

  const rows: DataTableRow[] = table.rows.map((p) => ({
    id: p.id,
    cells: [
      p.code,
      <Link key="name" href={`/app/places/${p.id}`} className="font-semibold text-primary underline underline-offset-4">
        {p.name}
      </Link>,
      ...(samnak
        ? [
            p.parent_place_id ? (
              <Link key="parent" href={`/app/places/${p.parent_place_id}`} className="text-primary underline underline-offset-4">
                {p.parent_name}
              </Link>
            ) : (
              "-"
            ),
          ]
        : []),
      placeAddress(p, false) || "-",
      <div key="unit">
        {p.org_unit_name}
        {p.sect ? <span className="block text-sm text-muted-foreground">{SECT_LABEL[p.sect]}</span> : null}
      </div>,
      p.responsible_name ?? "-",
      <PlaceStatusBadge key="status" status={p.status} isActive={p.is_active} />,
    ],
  }));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
          <p className="mt-1 text-muted-foreground">
            วัด สำนักเรียน สำนักศาสนศึกษา สถานศึกษา และองค์กร ในเขตที่ท่านดูแล กดที่ชื่อเพื่อดูรายละเอียด
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/app/places/template?type=${type}`} download>
                ดาวน์โหลดแม่แบบ Excel
              </a>
            </Button>
            <PlaceImportButton key={type} type={type} />
            <Button asChild>
              <Link href={`/app/places/new?type=${type}`}>
                <Plus aria-hidden />
                เพิ่ม{label}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <nav aria-label="ประเภทสถานที่" className="mt-6 flex flex-wrap gap-1 border-b" data-testid="place-tabs">
        {PLACE_TYPES.map((t) => (
          <Link
            key={t}
            href={`/app/places?type=${t}`}
            aria-current={t === type ? "page" : undefined}
            className={cn(
              "rounded-t-md border border-b-0 px-4 py-2 font-semibold",
              t === type ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {PLACE_TYPE_LABEL[t]}
            <span className={cn("ml-2 text-sm font-normal", t === type ? "text-primary-foreground/90" : "text-muted-foreground")}>
              {(counts[t] ?? 0).toLocaleString("th-TH")}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-4">
        {table.error ? <ErrorText>{explainError(table.error)}</ErrorText> : null}
        <UnitFilter units={units} value={params.filters.unit ?? ""} />
        <DataTable
          key={type}
          columns={[
            { key: "code", header: "รหัส", sortable: true },
            { key: "name", header: `ชื่อ${label}`, sortable: true },
            ...(samnak ? [{ key: "parent", header: "วัดที่ตั้ง" }] : []),
            { key: "address", header: "ที่ตั้ง" },
            { key: "unit", header: "เขตคณะสงฆ์ / นิกาย", sortable: true },
            { key: "responsible", header: "ผู้รับผิดชอบ" },
            { key: "status", header: "สถานะ", sortable: true },
          ]}
          rows={rows}
          total={table.total}
          page={params.page}
          pageSize={params.pageSize}
          sort={params.sort}
          dir={params.dir}
          q={params.q}
          searchPlaceholder={samnak ? "ค้นหาชื่อ รหัส หรือชื่อวัดที่ตั้ง" : "ค้นหาชื่อหรือรหัส"}
          filters={[
            {
              name: "province",
              label: "จังหวัด",
              options: provinces.map((p) => ({ value: String(p.code), label: p.name })),
            },
            {
              name: "status",
              label: "สถานะ",
              options: [
                ...PLACE_STATUSES.map((s) => ({ value: s as string, label: PLACE_STATUS_LABEL[s] })),
                { value: "inactive", label: "ปิดใช้งาน (บันทึกผิด)" },
              ],
            },
          ]}
          filterValues={params.filters}
          exportHref="/app/places/export"
          emptyText={`ไม่พบ${label}ตามเงื่อนไขนี้`}
        />
      </div>
    </section>
  );
}
