import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PlaceStatusBadge } from "@/components/place-status-badge";
import { PlaceMap } from "@/components/public/place-map";
import { VenueStatusBadge } from "@/components/venue-status-badge";
import { SECT_LABEL, type Sect } from "@/lib/org-units";
import { PLACE_TYPE_LABEL, placeAddress, type PlaceType } from "@/lib/places";
import { REGISTRY_BASE, findRegistryKind, registrySlugOfPlaceType } from "@/lib/registry";
import { fetchPublicPlace, fetchPublicVenue, type PublicPlace, type PublicRelated, type PublicVenue, type PublicVenueOfficer } from "@/lib/registry-server";
import { thaiDate } from "@/lib/thai";
import { OFFICER_ROLES, OFFICER_ROLE_LABEL, VENUE_STATUS_LABEL, VENUE_TYPE_LABEL, venueLevelsText, type VenueType } from "@/lib/venues";

type Props = { params: Promise<{ kind: string; id: string }> };

const sectLabel = (sect: string | null) => (sect ? (SECT_LABEL[sect as Sect] ?? "-") : "-");
const link = "text-primary underline underline-offset-4";

async function load(kindSlug: string, id: string) {
  const kind = findRegistryKind(kindSlug);
  if (!kind) return null;
  if (kind.placeType === null) {
    const data = await fetchPublicVenue(id);
    return data ? ({ type: "venue", kind, venue: data.venue, officers: data.officers } as const) : null;
  }
  const data = await fetchPublicPlace(id);
  return data ? ({ type: "place", kind, place: data.place, related: data.related } as const) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind, id } = await params;
  const data = await load(kind, id).catch(() => null);
  if (!data) return {};
  return { title: data.type === "venue" ? data.venue.name : data.place.name };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[13rem_1fr]">
      <dt className="font-semibold">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function RegistryDetailPage({ params }: Props) {
  const { kind: kindSlug, id } = await params;
  const data = await load(kindSlug, id);
  if (!data) notFound();
  if (data.type === "venue") return <VenueDetail venue={data.venue} officers={data.officers} />;
  // เปิดด้วยที่อยู่ของทะเบียนผิดประเภท (เช่น วัด ใต้ /registry/schools) ให้ไปที่อยู่ที่ถูกต้อง
  const slug = registrySlugOfPlaceType(data.place.place_type);
  if (slug !== data.kind.slug) redirect(`${REGISTRY_BASE}/${slug}/${data.place.id}`);
  return <PlaceDetail place={data.place} related={data.related} />;
}

function PlaceDetail({ place, related }: { place: PublicPlace; related: PublicRelated[] }) {
  const slug = registrySlugOfPlaceType(place.place_type);
  const typeLabel = PLACE_TYPE_LABEL[place.place_type];
  const venues = related.filter((r) => r.kind === "venue");
  const children = related.filter((r) => r.kind === "place");
  const hasMap = place.latitude !== null && place.longitude !== null;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <p>
        <Link href={`${REGISTRY_BASE}/${slug}`} className={link}>
          ← ทะเบียน{typeLabel}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{place.name}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        {typeLabel} · รหัส {place.code}
        <PlaceStatusBadge status={place.status} />
      </p>

      <dl className="mt-6 rounded-xl border bg-card px-5 py-2" data-testid="public-place">
        <Fact label="ชื่อ">{place.name}</Fact>
        <Fact label="ประเภท">{typeLabel}</Fact>
        {place.parent_place_id && place.parent_type ? (
          <Fact label="วัดที่ตั้ง">
            <Link href={`${REGISTRY_BASE}/${registrySlugOfPlaceType(place.parent_type)}/${place.parent_place_id}`} className={link}>
              {place.parent_name}
            </Link>
          </Fact>
        ) : null}
        <Fact label="นิกาย">{sectLabel(place.sect)}</Fact>
        <Fact label="ที่ตั้ง">{placeAddress(place) || "-"}</Fact>
        <Fact label="สังกัดคณะสงฆ์">
          {place.org_unit_name}
          {place.region_name && place.region_name !== place.org_unit_name ? (
            <span className="block text-sm text-muted-foreground">{place.region_name}</span>
          ) : null}
        </Fact>
        <Fact label="โทรศัพท์สำนักงาน">
          {place.office_phone ? (
            <a href={`tel:${place.office_phone.replace(/[^0-9+]/g, "")}`} className={link}>
              {place.office_phone}
            </a>
          ) : (
            "-"
          )}
        </Fact>
        {place.established_on ? <Fact label="วันที่จัดตั้ง">{thaiDate(place.established_on)}</Fact> : null}
      </dl>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">แผนที่</h2>
        <div className="mt-3">
          {hasMap ? (
            <PlaceMap latitude={place.latitude!} longitude={place.longitude!} name={place.name} />
          ) : (
            <p className="text-muted-foreground" data-testid="place-map-none">
              ยังไม่มีพิกัดของสถานที่นี้ในทะเบียน
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5" data-testid="place-venues">
        <h2 className="text-xl font-bold text-primary">สนามสอบที่เกี่ยวข้อง</h2>
        {venues.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ไม่มีสนามสอบที่ตั้งอยู่ที่นี่</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {venues.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0">
                <span>
                  <Link href={`${REGISTRY_BASE}/venues/${v.id}`} className={`font-semibold ${link}`}>
                    {v.name}
                  </Link>
                  <span className="block text-sm text-muted-foreground">
                    {VENUE_TYPE_LABEL[v.subtype as VenueType] ?? v.subtype} · {venueLevelsText(v.levels)} · รหัส {v.code}
                  </span>
                </span>
                <VenueStatusBadge status={v.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {children.length > 0 ? (
        <div className="mt-6 rounded-xl border bg-card p-5" data-testid="place-children">
          <h2 className="text-xl font-bold text-primary">สำนักที่ตั้งอยู่ในวัดนี้</h2>
          <ul className="mt-2 flex flex-col">
            {children.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0">
                <span>
                  <Link href={`${REGISTRY_BASE}/${registrySlugOfPlaceType(c.subtype)}/${c.id}`} className={`font-semibold ${link}`}>
                    {c.name}
                  </Link>
                  <span className="block text-sm text-muted-foreground">{PLACE_TYPE_LABEL[c.subtype as PlaceType] ?? c.subtype}</span>
                </span>
                <PlaceStatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function VenueDetail({ venue, officers }: { venue: PublicVenue; officers: PublicVenueOfficer[] }) {
  const hasMap = venue.latitude !== null && venue.longitude !== null;
  const yearBe = officers[0]?.year_be;
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <p>
        <Link href={`${REGISTRY_BASE}/venues`} className={link}>
          ← ทะเบียนสนามสอบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{venue.name}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        สนามสอบ{VENUE_TYPE_LABEL[venue.venue_type]} · รหัส {venue.code}
        <VenueStatusBadge status={venue.status} />
      </p>

      <dl className="mt-6 rounded-xl border bg-card px-5 py-2" data-testid="public-venue">
        <Fact label="ชื่อสนามสอบ">{venue.name}</Fact>
        <Fact label="ประเภท">{VENUE_TYPE_LABEL[venue.venue_type]}</Fact>
        <Fact label="ชั้นที่เปิดสอบ">{venueLevelsText(venue.levels) || "-"}</Fact>
        <Fact label="ที่อยู่สนามสอบ">
          {venue.place_id ? (
            <Link href={`${REGISTRY_BASE}/${registrySlugOfPlaceType(venue.place_type)}/${venue.place_id}`} className={link}>
              {venue.place_name}
            </Link>
          ) : (
            venue.place_name
          )}
          <span className="block">{placeAddress(venue) || "-"}</span>
        </Fact>
        <Fact label="โทรศัพท์สำนักงานของสถานที่ตั้ง">
          {venue.place_phone ? (
            <a href={`tel:${venue.place_phone.replace(/[^0-9+]/g, "")}`} className={link}>
              {venue.place_phone}
            </a>
          ) : (
            "-"
          )}
        </Fact>
        <Fact label="สังกัดคณะสงฆ์">
          {venue.org_unit_name}
          <span className="block text-sm text-muted-foreground">
            {[venue.region_name !== venue.org_unit_name ? venue.region_name : null, venue.sect ? sectLabel(venue.sect) : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </Fact>
        <Fact label="สถานะ">
          {VENUE_STATUS_LABEL[venue.status]}
          {venue.status === "moved" && venue.moved_to_venue_id ? (
            <>
              {" "}
              ไป{" "}
              <Link href={`${REGISTRY_BASE}/venues/${venue.moved_to_venue_id}`} className={link}>
                {venue.moved_to_name}
              </Link>
            </>
          ) : null}
        </Fact>
      </dl>

      <div className="mt-6 rounded-xl border bg-card p-5" data-testid="public-officers">
        <h2 className="text-xl font-bold text-primary">
          ประธานสนามสอบและผู้รับข้อสอบ{yearBe ? ` ปีการศึกษา ${yearBe}` : ""}
        </h2>
        <dl className="mt-2">
          {OFFICER_ROLES.map((role) => {
            const o = officers.find((x) => x.role === role);
            return (
              <Fact key={role} label={OFFICER_ROLE_LABEL[role]}>
                {o ? (
                  <>
                    {o.display_name}
                    {o.contact_phone ? (
                      <span className="block">
                        โทร.{" "}
                        <a href={`tel:${o.contact_phone.replace(/[^0-9+]/g, "")}`} className={link}>
                          {o.contact_phone}
                        </a>
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">ไม่เผยแพร่ หรือยังไม่มีรายชื่อของปีการศึกษาปัจจุบัน</span>
                )}
              </Fact>
            );
          })}
        </dl>
        <p className="mt-2 text-sm text-muted-foreground">
          แสดงเฉพาะชื่อและเบอร์ติดต่อที่เจ้าของข้อมูลยินยอมให้เผยแพร่ หากต้องการติดต่อสนามสอบ กรุณาใช้โทรศัพท์สำนักงานของสถานที่ตั้ง
        </p>
      </div>

      {hasMap ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">แผนที่</h2>
          <div className="mt-3">
            <PlaceMap latitude={venue.latitude!} longitude={venue.longitude!} name={venue.place_name} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
