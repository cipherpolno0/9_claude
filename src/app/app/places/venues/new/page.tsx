import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchAccessibleUnits } from "@/lib/org-units-server";

import { VenueForm } from "../venue-form";

export const metadata: Metadata = { title: "เพิ่มสนามสอบ" };
export const dynamic = "force-dynamic";

export default async function NewVenuePage() {
  const ctx = await requireMenu("/app/places");
  if (!ctx.canEditVenues) redirect("/app/places/venues");
  const units = await fetchAccessibleUnits();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/places/venues" className="text-primary underline underline-offset-4">
          ← ทะเบียนสนามสอบ
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-primary sm:text-3xl">เพิ่มสนามสอบ</h1>
      <VenueForm units={units} />
    </section>
  );
}
