import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { PLACE_TYPE_LABEL } from "@/lib/places";
import { VENUE_TYPE_LABEL } from "@/lib/venues";
import { fetchVenue } from "@/lib/venues-server";

import { VenueForm } from "../../venue-form";

export const metadata: Metadata = { title: "แก้ไขสนามสอบ" };
export const dynamic = "force-dynamic";

export default async function EditVenuePage({ params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/places");
  const { id } = await params;
  const venue = await fetchVenue(id);
  if (!venue) notFound();
  if (!venue.can_edit) redirect(`/app/places/venues/${venue.id}`);
  const units = await fetchAccessibleUnits();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/places/venues/${venue.id}`} className="text-primary underline underline-offset-4">
          ← {venue.name}
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-primary sm:text-3xl">แก้ไขสนามสอบ</h1>
      <VenueForm
        venue={venue}
        units={units}
        place={{
          id: venue.place_id,
          label: venue.place_name,
          detail: `${PLACE_TYPE_LABEL[venue.place_type]} · รหัส ${venue.place_code}`,
          data: { org_unit_id: venue.org_unit_id },
        }}
        movedTo={
          venue.moved_to_venue_id
            ? {
                id: venue.moved_to_venue_id,
                label: venue.moved_to_name ?? "",
                detail: `${VENUE_TYPE_LABEL[venue.venue_type]} · รหัส ${venue.moved_to_code ?? ""}`,
              }
            : null
        }
      />
    </section>
  );
}
