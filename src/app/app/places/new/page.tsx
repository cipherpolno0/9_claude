import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { PLACE_TYPE_LABEL, isPlaceType, type PlaceType } from "@/lib/places";
import { fetchCivilProvinces } from "@/lib/places-server";

import { PlaceForm } from "../place-form";

export const metadata: Metadata = { title: "เพิ่มสถานที่" };
export const dynamic = "force-dynamic";

export default async function NewPlacePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const ctx = await requireMenu("/app/places");
  const { type: rawType } = await searchParams;
  const type: PlaceType = isPlaceType(rawType) ? rawType : "temple";
  if (!ctx.canEditPlaces) redirect(`/app/places?type=${type}`);
  const [units, provinces] = await Promise.all([fetchAccessibleUnits(), fetchCivilProvinces()]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/places?type=${type}`} className="text-primary underline underline-offset-4">
          ← ทะเบียนสถานที่
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-primary sm:text-3xl">เพิ่ม{PLACE_TYPE_LABEL[type]}</h1>
      <PlaceForm type={type} units={units} provinces={provinces} />
    </section>
  );
}
