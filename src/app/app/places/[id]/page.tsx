import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { Attachments } from "@/components/attachments";
import { InfoText } from "@/components/form";
import { PlaceStatusBadge } from "@/components/place-status-badge";
import { HistoryList } from "@/components/record-history";
import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { SECT_LABEL, type Sect } from "@/lib/org-units";
import {
  PLACE_FIELD_LABEL,
  PLACE_STATUS_LABEL,
  PLACE_TYPE_LABEL,
  placeAddress,
  type PlaceStatus,
  type PlaceType,
} from "@/lib/places";
import { canEditPlace, fetchChildPlaces, fetchPlace, fetchPlaceHistory } from "@/lib/places-server";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { FactRow } from "../../personnel/person-facts";
import { PlaceActiveButton } from "./place-actions";

export const metadata: Metadata = { title: "รายละเอียดสถานที่" };
export const dynamic = "force-dynamic";

function formatHistory(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field === "status") return PLACE_STATUS_LABEL[value as PlaceStatus] ?? null;
  if (field === "sect") return SECT_LABEL[value as Sect] ?? null;
  if (field === "place_type") return PLACE_TYPE_LABEL[value as PlaceType] ?? null;
  if (field === "is_active") return value ? "ใช้งาน" : "ปิดใช้งาน";
  if (field === "established_on") return thaiDate(String(value));
  if (field === "org_unit_id" || field === "responsible_person_id" || field === "parent_place_id") return "(เปลี่ยนรายการ)";
  return null;
}

export default async function PlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/places");
  const { id } = await params;
  const query = await searchParams;
  // ถ้า RLS ไม่ให้เห็นสถานที่นี้ จะได้ null และแสดงหน้าไม่พบ
  const place = await fetchPlace(id);
  if (!place) notFound();

  const temple = place.place_type === "temple";
  const tabs = [
    { key: "general", label: "ข้อมูลทั่วไป" },
    ...(temple ? [{ key: "children", label: "สำนักในวัดนี้" }] : []),
    { key: "files", label: "เอกสารแนบ" },
    { key: "history", label: "ประวัติการแก้ไข" },
  ];
  const tab = tabs.some((t) => t.key === query.tab) ? String(query.tab) : "general";
  const canEdit = await canEditPlace(place.org_unit_id);
  const typeLabel = PLACE_TYPE_LABEL[place.place_type];

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/places?type=${place.place_type}`} className="text-primary underline underline-offset-4">
          ← ทะเบียนสถานที่ ({typeLabel})
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{place.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            {typeLabel} · รหัส {place.code} · {place.org_unit_name}
            <PlaceStatusBadge status={place.status} isActive={place.is_active} />
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/app/places/${place.id}/edit`}>
                <Pencil aria-hidden />
                แก้ไขข้อมูล
              </Link>
            </Button>
            <PlaceActiveButton placeId={place.id} isActive={place.is_active} />
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
            href={`/app/places/${place.id}?tab=${t.key}`}
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
          <dl className="rounded-xl border bg-card px-5 py-2" data-testid="place-general">
            <FactRow label="ประเภท">{typeLabel}</FactRow>
            <FactRow label="รหัส">{place.code}</FactRow>
            <FactRow label="ชื่อ">{place.name}</FactRow>
            {place.parent_place_id ? (
              <FactRow label="วัดที่ตั้ง">
                <Link href={`/app/places/${place.parent_place_id}`} className="text-primary underline underline-offset-4">
                  {place.parent_name}
                </Link>{" "}
                <span className="text-muted-foreground">(รหัส {place.parent_code})</span>
              </FactRow>
            ) : null}
            <FactRow label="นิกาย">{place.sect ? SECT_LABEL[place.sect] : "-"}</FactRow>
            <FactRow label="ที่ตั้ง">{placeAddress(place) || "-"}</FactRow>
            <FactRow label="เขตปกครองคณะสงฆ์ที่สังกัด">{place.org_unit_name}</FactRow>
            <FactRow label="พิกัด">
              {place.latitude !== null && place.longitude !== null ? (
                <a
                  href={`https://www.google.com/maps?q=${place.latitude},${place.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  {place.latitude}, {place.longitude} (เปิดแผนที่)
                </a>
              ) : (
                "-"
              )}
            </FactRow>
            <FactRow label="โทรศัพท์สำนักงาน">{place.office_phone || "-"}</FactRow>
            <FactRow label="อีเมล">{place.email || "-"}</FactRow>
            <FactRow label="ผู้รับผิดชอบ">
              {place.responsible_person_id ? (place.responsible_name ?? "-") : "-"}
            </FactRow>
            <FactRow label="สถานะ">{PLACE_STATUS_LABEL[place.status]}</FactRow>
            <FactRow label="วันที่จัดตั้ง">{thaiDate(place.established_on)}</FactRow>
            <FactRow label="หมายเหตุ">{place.note || "-"}</FactRow>
          </dl>
        ) : null}

        {tab === "children" && temple ? <Children templeId={place.id} canAdd={canEdit && place.is_active} /> : null}

        {tab === "files" ? (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-bold text-primary">เอกสารแนบ</h2>
            <p className="mb-3 text-muted-foreground">เช่น หนังสือจัดตั้ง ประกาศ หรือแผนที่</p>
            <Attachments
              entityTable="places"
              entityId={place.id}
              orgUnitId={place.org_unit_id}
              currentUserId={ctx.user.id}
              canUpload={canEdit}
              canRemoveAny={canEdit}
            />
          </div>
        ) : null}

        {tab === "history" ? (
          <HistoryList logs={await fetchPlaceHistory(place.id)} labels={PLACE_FIELD_LABEL} format={formatHistory} />
        ) : null}
      </div>
    </section>
  );
}

async function Children({ templeId, canAdd }: { templeId: string; canAdd: boolean }) {
  const children = await fetchChildPlaces(templeId);
  return (
    <div className="rounded-xl border bg-card p-5" data-testid="place-children">
      <h2 className="text-xl font-bold text-primary">สำนักเรียนและสำนักศาสนศึกษาในวัดนี้</h2>
      {children.length === 0 ? (
        <p className="mt-2 text-muted-foreground">ยังไม่มีสำนักที่ผูกกับวัดนี้ (เท่าที่ท่านมีสิทธิ์ดู)</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {children.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0">
              <span>
                <Link href={`/app/places/${c.id}`} className="font-semibold text-primary underline underline-offset-4">
                  {c.name}
                </Link>
                <span className="ml-2 text-sm text-muted-foreground">
                  {PLACE_TYPE_LABEL[c.place_type]} · รหัส {c.code}
                </span>
              </span>
              <PlaceStatusBadge status={c.status} isActive={c.is_active} />
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <p className="mt-4 text-sm text-muted-foreground">
          เพิ่มสำนักใหม่ได้ที่แท็บ{" "}
          <Link href="/app/places/new?type=samnak_rian" className="text-primary underline underline-offset-4">
            สำนักเรียน
          </Link>{" "}
          หรือ{" "}
          <Link href="/app/places/new?type=samnak_sasanasuksa" className="text-primary underline underline-offset-4">
            สำนักศาสนศึกษา
          </Link>{" "}
          แล้วเลือกวัดนี้เป็นวัดที่ตั้ง
        </p>
      ) : null}
    </div>
  );
}
