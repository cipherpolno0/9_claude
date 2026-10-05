import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { loadCivilDistricts, loadCivilSubdistricts } from "@/lib/civil-areas";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { PLACE_TYPE_LABEL } from "@/lib/places";
import { canEditPlace, fetchCivilProvinces, fetchPlace } from "@/lib/places-server";

import { PlaceForm } from "../../place-form";

export const metadata: Metadata = { title: "แก้ไขสถานที่" };
export const dynamic = "force-dynamic";

export default async function EditPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMenu("/app/places");
  const { id } = await params;
  const place = await fetchPlace(id);
  if (!place) notFound();
  if (!(await canEditPlace(place.org_unit_id))) redirect(`/app/places/${place.id}`);
  const [units, provinces, districts, subdistricts] = await Promise.all([
    fetchAccessibleUnits(),
    fetchCivilProvinces(),
    place.province_code ? loadCivilDistricts(place.province_code) : [],
    place.district_code ? loadCivilSubdistricts(place.district_code) : [],
  ]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/places/${place.id}`} className="text-primary underline underline-offset-4">
          ← {place.name}
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-primary sm:text-3xl">แก้ไข{PLACE_TYPE_LABEL[place.place_type]}</h1>
      <PlaceForm
        type={place.place_type}
        place={place}
        units={units}
        provinces={provinces}
        area={{ districts, subdistricts }}
        isAdmin={ctx.isAdmin}
        parent={
          place.parent_place_id
            ? { id: place.parent_place_id, label: place.parent_name ?? "", detail: `รหัส ${place.parent_code ?? ""}` }
            : null
        }
        responsible={
          place.responsible_person_id
            ? { id: place.responsible_person_id, label: place.responsible_name ?? "(ท่านไม่มีสิทธิ์ดูชื่อ)" }
            : null
        }
      />
    </section>
  );
}
