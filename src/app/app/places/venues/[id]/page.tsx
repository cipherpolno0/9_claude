import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { InfoText } from "@/components/form";
import { HistoryList } from "@/components/record-history";
import { Button } from "@/components/ui/button";
import { VenueStatusBadge } from "@/components/venue-status-badge";
import { requireMenu } from "@/lib/auth/guards";
import { PLACE_TYPE_LABEL, placeAddress } from "@/lib/places";
import { cn } from "@/lib/utils";
import {
  OFFICER_ROLES,
  OFFICER_ROLE_LABEL,
  VENUE_FIELD_LABEL,
  VENUE_STATUS_LABEL,
  VENUE_TYPE_LABEL,
  venueLevelsText,
  type OfficerRole,
  type VenueStatus,
  type VenueType,
} from "@/lib/venues";
import { fetchAcademicYears, fetchVenue, fetchVenueHistory, fetchVenueOfficers, pickYear } from "@/lib/venues-server";

import { FactRow } from "../../../personnel/person-facts";
import { OfficerPanel } from "./officer-panel";
import { VenueActiveButton } from "./venue-actions";

export const metadata: Metadata = { title: "รายละเอียดสนามสอบ" };
export const dynamic = "force-dynamic";

function formatHistory(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field === "status") return VENUE_STATUS_LABEL[value as VenueStatus] ?? null;
  if (field === "venue_type") return VENUE_TYPE_LABEL[value as VenueType] ?? null;
  if (field === "role") return OFFICER_ROLE_LABEL[value as OfficerRole] ?? null;
  if (field === "levels") return Array.isArray(value) ? venueLevelsText(value as string[]) : null;
  if (field === "is_active") return value ? "ใช้งาน" : "ปิดใช้งาน (นำออก)";
  if (field === "is_public") return value ? "ยินยอมให้เผยแพร่ชื่อ" : "ไม่เผยแพร่";
  if (["org_unit_id", "place_id", "moved_to_venue_id", "person_id", "venue_id", "academic_year_id", "copied_from_id"].includes(field)) {
    return "(เปลี่ยนรายการ)";
  }
  return null;
}

export default async function VenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/places");
  const { id } = await params;
  const query = await searchParams;
  // ถ้าไม่มีสิทธิ์ดูสนามสอบนี้ ฐานข้อมูลจะไม่คืนแถว และแสดงหน้าไม่พบ
  const venue = await fetchVenue(id);
  if (!venue) notFound();

  const tabs = [
    { key: "general", label: "ข้อมูลทั่วไป" },
    { key: "officers", label: "ประธานและผู้รับข้อสอบ" },
    { key: "history", label: "ประวัติการแก้ไข" },
  ];
  const tab = tabs.some((t) => t.key === query.tab) ? String(query.tab) : "general";
  const years = await fetchAcademicYears();
  const year = pickYear(years, typeof query.year === "string" ? query.year : null);
  const base = `/app/places/venues/${venue.id}`;
  const yearQuery = year ? `&year=${year.year_be}` : "";

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/places/venues${year ? `?year=${year.year_be}` : ""}`} className="text-primary underline underline-offset-4">
          ← ทะเบียนสนามสอบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{venue.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            สนามสอบ{VENUE_TYPE_LABEL[venue.venue_type]} · รหัส {venue.code} · {venue.org_unit_name}
            <VenueStatusBadge status={venue.status} isActive={venue.is_active} />
          </p>
        </div>
        {venue.can_edit ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`${base}/edit`}>
                <Pencil aria-hidden />
                แก้ไขข้อมูล
              </Link>
            </Button>
            <VenueActiveButton venueId={venue.id} isActive={venue.is_active} />
          </div>
        ) : null}
      </div>

      {query.saved ? (
        <div className="mt-4">
          <InfoText>บันทึกข้อมูลแล้ว</InfoText>
        </div>
      ) : null}

      <nav aria-label="หัวข้อรายละเอียด" className="mt-6 flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}${yearQuery}`}
            aria-current={tab === t.key ? "page" : undefined}
            scroll={false}
            className={cn(
              "rounded-t-md border border-b-0 px-4 py-2 font-semibold",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "general" ? (
          <dl className="rounded-xl border bg-card px-5 py-2" data-testid="venue-general">
            <FactRow label="รหัสสนามสอบ">{venue.code}</FactRow>
            <FactRow label="ชื่อ">{venue.name}</FactRow>
            <FactRow label="ประเภท">{VENUE_TYPE_LABEL[venue.venue_type]}</FactRow>
            <FactRow label="ชั้นที่เปิดสอบ">{venueLevelsText(venue.levels) || "-"}</FactRow>
            <FactRow label="ความจุ">{venue.capacity !== null ? `${venue.capacity.toLocaleString("th-TH")} คน` : "-"}</FactRow>
            <FactRow label="สถานที่ตั้ง">
              <Link href={`/app/places/${venue.place_id}`} className="text-primary underline underline-offset-4">
                {venue.place_name}
              </Link>{" "}
              <span className="text-muted-foreground">
                ({PLACE_TYPE_LABEL[venue.place_type]} รหัส {venue.place_code})
              </span>
              <span className="block">{placeAddress(venue) || "-"}</span>
            </FactRow>
            <FactRow label="เขตปกครองคณะสงฆ์ที่สังกัด">{venue.org_unit_name}</FactRow>
            <FactRow label="สถานะ">
              {VENUE_STATUS_LABEL[venue.status]}
              {venue.status === "moved" && venue.moved_to_venue_id ? (
                <>
                  {" "}
                  ไป{" "}
                  <Link href={`/app/places/venues/${venue.moved_to_venue_id}`} className="text-primary underline underline-offset-4">
                    {venue.moved_to_name}
                  </Link>{" "}
                  <span className="text-muted-foreground">(รหัส {venue.moved_to_code})</span>
                </>
              ) : null}
            </FactRow>
            <FactRow label="ปีการศึกษาที่เริ่มใช้">{venue.start_year_be ?? "-"}</FactRow>
            <FactRow label="หมายเหตุ">{venue.note || "-"}</FactRow>
          </dl>
        ) : null}

        {tab === "officers" ? (
          <Officers venueId={venue.id} canEdit={venue.can_edit && venue.is_active} open={venue.is_active && venue.status === "open"} base={base} year={year} years={years} />
        ) : null}

        {tab === "history" ? (
          <HistoryList
            logs={(await fetchVenueHistory(venue.id)).map((l) => ({
              ...l,
              subject: l.table_name === "venue_officers" ? "ประธานหรือผู้รับข้อสอบ" : "สนามสอบ",
            }))}
            labels={VENUE_FIELD_LABEL}
            format={formatHistory}
          />
        ) : null}
      </div>
    </section>
  );
}

async function Officers({
  venueId,
  canEdit,
  open,
  base,
  year,
  years,
}: {
  venueId: string;
  canEdit: boolean;
  open: boolean;
  base: string;
  year: Awaited<ReturnType<typeof fetchAcademicYears>>[number] | null;
  years: Awaited<ReturnType<typeof fetchAcademicYears>>;
}) {
  if (!year) {
    return (
      <p className="rounded-xl border bg-card p-5 text-muted-foreground">
        ยังไม่มีปีการศึกษาในระบบ ผู้ดูแลระบบเพิ่มได้ที่หน้า บทบาทและค่าตั้ง
      </p>
    );
  }
  const officers = await fetchVenueOfficers(venueId);
  const current = years.find((y) => y.is_current);
  const warn = open && (!current || year.year_be >= current.year_be);
  const others = officers.filter((o) => o.academic_year_id !== year.id);

  return (
    <div className="flex flex-col gap-4" data-testid="venue-officers">
      <nav aria-label="เลือกปีการศึกษา" className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">ปีการศึกษา:</span>
        {years.map((y) => (
          <Link
            key={y.id}
            href={`${base}?tab=officers&year=${y.year_be}`}
            aria-current={y.id === year.id ? "page" : undefined}
            scroll={false}
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
      <div className="grid gap-4 lg:grid-cols-2">
        {OFFICER_ROLES.map((role) => (
          <OfficerPanel
            key={`${year.id}-${role}`}
            venueId={venueId}
            yearId={year.id}
            yearBe={year.year_be}
            role={role}
            officer={officers.find((o) => o.academic_year_id === year.id && o.role === role) ?? null}
            canEdit={canEdit}
            warnMissing={warn}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        ที่อยู่จัดส่งข้อสอบและเบอร์ติดต่อเป็นข้อมูลภายใน เห็นได้เฉพาะผู้มีสิทธิ์ดูทะเบียนสนามสอบของเขตนี้
      </p>

      {others.length > 0 ? (
        <div className="rounded-xl border bg-card p-5" data-testid="officers-other-years">
          <h3 className="text-lg font-bold text-primary">ปีการศึกษาอื่น</h3>
          <ul className="mt-2 flex flex-col">
            {others.map((o) => (
              <li key={o.id} className="flex flex-wrap gap-x-3 border-b py-2 last:border-b-0">
                <Link href={`${base}?tab=officers&year=${o.year_be}`} scroll={false} className="font-semibold text-primary underline underline-offset-4">
                  {o.year_be}
                </Link>
                <span>{OFFICER_ROLE_LABEL[o.role]}:</span>
                <span>{o.person_name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
