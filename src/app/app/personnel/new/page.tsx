import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { isPersonnelEditor } from "@/lib/persons-server";

import { PersonForm } from "../person-form";

export const metadata: Metadata = { title: "เพิ่มบุคคล" };
export const dynamic = "force-dynamic";

export default async function NewPersonPage() {
  const ctx = await requireMenu("/app/personnel");
  if (!isPersonnelEditor(ctx)) redirect("/app/personnel");
  const units = await fetchAccessibleUnits();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/personnel" className="text-primary underline underline-offset-4">
          ← ทะเบียนบุคคล
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-primary sm:text-3xl">เพิ่มบุคคล</h1>
      <PersonForm units={units} />
    </section>
  );
}
