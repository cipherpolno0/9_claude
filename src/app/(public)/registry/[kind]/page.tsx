import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { PlaceStatusBadge } from "@/components/place-status-badge";
import { VenueStatusBadge } from "@/components/venue-status-badge";
import { SECTS, SECT_LABEL, type Sect } from "@/lib/org-units";
import { PLACE_STATUSES, PLACE_STATUS_LABEL, placeAddress } from "@/lib/places";
import { PUBLIC_EXPORT_LIMIT, REGISTRY_BASE, findRegistryKind } from "@/lib/registry";
import {
  fetchPublicDistricts,
  fetchPublicProvinces,
  fetchPublicRegions,
  fetchPublicSubdistricts,
  queryPublicPlaces,
  queryPublicVenues,
  readRegistryFilters,
  registryTableParams,
} from "@/lib/registry-server";
import { VENUE_STATUSES, VENUE_STATUS_LABEL, VENUE_TYPES, VENUE_TYPE_LABEL, venueLevelsText } from "@/lib/venues";

type Props = {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const kind = findRegistryKind((await params).kind);
  return kind ? { title: `ทะเบียน${kind.title}`, description: kind.description } : {};
}

const sectLabel = (sect: string | null) => (sect ? (SECT_LABEL[sect as Sect] ?? "") : "");
// ลิงก์ของแต่ละแถวปิด prefetch: หน้าหนึ่งมี 20 แถว ถ้าโหลดหน้ารายละเอียดล่วงหน้าทุกแถวจะเปลืองโดยไม่จำเป็น
const link = "font-semibold text-primary underline underline-offset-4";

export default async function RegistryListPage({ params, searchParams }: Props) {
  const kind = findRegistryKind((await params).kind);
  if (!kind) notFound();
  const venues = kind.placeType === null;
  const table = registryTableParams(await searchParams);
  const filters = readRegistryFilters(table, venues);
  const base = `${REGISTRY_BASE}/${kind.slug}`;

  const [result, regions, provinces, districts, subdistricts] = await Promise.all([
    (venues
      ? queryPublicVenues(filters, table.pageSize, table.from)
      : queryPublicPlaces(kind.placeType, filters, table.pageSize, table.from)
    ).then(
      (r) => ({ ...r, error: null as string | null }),
      () => ({ rows: [], total: 0, error: "อ่านข้อมูลไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" }),
    ),
    fetchPublicRegions(),
    fetchPublicProvinces(),
    filters.province !== null ? fetchPublicDistricts(filters.province) : [],
    filters.district !== null ? fetchPublicSubdistricts(filters.district) : [],
  ]);

  const rows: DataTableRow[] = venues
    ? (result.rows as Awaited<ReturnType<typeof queryPublicVenues>>["rows"]).map((v) => ({
        id: v.id,
        cells: [
          <div key="name">
            <Link href={`${base}/${v.id}`} prefetch={false} className={link}>
              {v.name}
            </Link>
            <span className="block text-sm text-muted-foreground">รหัส {v.code}</span>
          </div>,
          <div key="type">
            {VENUE_TYPE_LABEL[v.venue_type]}
            <span className="block text-sm text-muted-foreground">{venueLevelsText(v.levels)}</span>
          </div>,
          <div key="place">
            {v.place_name}
            <span className="block text-sm text-muted-foreground">{placeAddress(v, false)}</span>
          </div>,
          <div key="region">
            {v.region_name ?? "-"}
            <span className="block text-sm text-muted-foreground">{sectLabel(v.sect)}</span>
          </div>,
          <VenueStatusBadge key="status" status={v.status} />,
        ],
      }))
    : (result.rows as Awaited<ReturnType<typeof queryPublicPlaces>>["rows"]).map((p) => ({
        id: p.id,
        cells: [
          <div key="name">
            <Link href={`${base}/${p.id}`} prefetch={false} className={link}>
              {p.name}
            </Link>
            {p.parent_name ? <span className="block text-sm text-muted-foreground">ตั้งอยู่ที่ {p.parent_name}</span> : null}
          </div>,
          placeAddress(p, false) || "-",
          <div key="region">
            {p.region_name ?? "-"}
            <span className="block text-sm text-muted-foreground">{sectLabel(p.sect)}</span>
          </div>,
          p.office_phone || "-",
          <PlaceStatusBadge key="status" status={p.status} />,
        ],
      }));

  const statusOptions = venues
    ? VENUE_STATUSES.map((s) => ({ value: s as string, label: VENUE_STATUS_LABEL[s] }))
    : PLACE_STATUSES.map((s) => ({ value: s as string, label: PLACE_STATUS_LABEL[s] }));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <p>
        <Link href={REGISTRY_BASE} className="text-primary underline underline-offset-4">
          ← ทะเบียน
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ทะเบียน{kind.title}</h1>
      <p className="mt-2 text-muted-foreground">
        {kind.description} ค้นด้วยชื่อ{venues ? "สนามสอบหรือชื่อสถานที่ตั้ง" : ""} แล้วกรองตามภาค จังหวัด อำเภอ ตำบล นิกาย
        และสถานะได้ กดที่ชื่อเพื่อดูรายละเอียด
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {result.error ? <ErrorText>{result.error}</ErrorText> : null}
        <p className="text-lg" data-testid="registry-total" aria-live="polite">
          พบ <strong>{result.total.toLocaleString("th-TH")}</strong> แห่ง
        </p>
        <DataTable
          key={kind.slug}
          columns={
            venues
              ? [
                  { key: "name", header: "สนามสอบ" },
                  { key: "type", header: "ประเภท / ชั้นที่เปิดสอบ" },
                  { key: "place", header: "ที่ตั้ง" },
                  { key: "region", header: "ภาค / นิกาย" },
                  { key: "status", header: "สถานะ" },
                ]
              : [
                  { key: "name", header: `ชื่อ${kind.title}` },
                  { key: "address", header: "ที่ตั้ง" },
                  { key: "region", header: "ภาค / นิกาย" },
                  { key: "phone", header: "โทรศัพท์สำนักงาน" },
                  { key: "status", header: "สถานะ" },
                ]
          }
          rows={rows}
          total={result.total}
          page={table.page}
          pageSize={table.pageSize}
          sort=""
          dir="asc"
          q={table.q}
          searchPlaceholder={venues ? "ค้นหาชื่อสนามสอบหรือสถานที่ตั้ง" : `ค้นหาชื่อ${kind.title}`}
          filters={[
            ...(venues
              ? [{ name: "type", label: "ประเภท", options: VENUE_TYPES.map((t) => ({ value: t as string, label: VENUE_TYPE_LABEL[t] })) }]
              : []),
            { name: "region", label: "ภาค (คณะสงฆ์)", options: regions.map((r) => ({ value: r.id, label: r.name })) },
            {
              name: "province",
              label: "จังหวัด",
              options: provinces.map((p) => ({ value: String(p.code), label: p.name })),
              clears: ["district", "subdistrict"],
            },
            {
              name: "district",
              label: "อำเภอ",
              clears: ["subdistrict"],
              options: districts.map((d) => ({ value: String(d.code), label: `${d.prefix ?? ""}${d.name}` })),
            },
            {
              name: "subdistrict",
              label: "ตำบล",
              options: subdistricts.map((s) => ({ value: String(s.code), label: `${s.prefix ?? ""}${s.name}` })),
            },
            { name: "sect", label: "นิกาย", options: SECTS.map((s) => ({ value: s as string, label: SECT_LABEL[s] })) },
            { name: "status", label: "สถานะ", options: statusOptions },
          ]}
          filterValues={{
            type: filters.venueType ?? "",
            region: filters.region ?? "",
            province: filters.province !== null ? String(filters.province) : "",
            district: filters.district !== null ? String(filters.district) : "",
            subdistrict: filters.subdistrict !== null ? String(filters.subdistrict) : "",
            sect: filters.sect ?? "",
            status: filters.status ?? "",
          }}
          exportHref={`${base}/export`}
          emptyText={`ไม่พบ${kind.title}ตามเงื่อนไขนี้`}
        />
        <p className="text-sm text-muted-foreground">
          เลือกจังหวัดก่อนจึงเลือกอำเภอได้ และเลือกอำเภอก่อนจึงเลือกตำบลได้ · ปุ่ม ส่งออก Excel ส่งออกรายการตามเงื่อนไขที่กรองอยู่
          ครั้งละไม่เกิน {PUBLIC_EXPORT_LIMIT.toLocaleString("th-TH")} แถว
          {result.total > PUBLIC_EXPORT_LIMIT ? " (ผลลัพธ์มีมากกว่านี้ กรุณากรองให้แคบลงเพื่อให้ได้ครบ)" : ""} ·
          ข้อมูลอาจตามหลังการแก้ไขล่าสุดไม่เกิน 5 นาที
        </p>
      </div>
    </section>
  );
}
