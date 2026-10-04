import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { personName } from "@/lib/persons";
import { editableUnits, fetchPerson } from "@/lib/persons-server";

import { PersonForm } from "../../person-form";

export const metadata: Metadata = { title: "แก้ไขบุคคล" };
export const dynamic = "force-dynamic";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/personnel");
  const { id } = await params;
  const person = await fetchPerson(id);
  if (!person) notFound();
  const editable = await editableUnits([person.org_unit_id]);
  if (!editable.has(person.org_unit_id)) redirect(`/app/personnel/${person.id}`);
  const units = await fetchAccessibleUnits();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/personnel/${person.id}`} className="text-primary underline underline-offset-4">
          ← {personName(person)}
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-primary sm:text-3xl">แก้ไขข้อมูลบุคคล</h1>
      <PersonForm person={person} units={units} />
    </section>
  );
}
