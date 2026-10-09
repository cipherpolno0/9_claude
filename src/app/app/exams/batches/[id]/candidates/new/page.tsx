import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { examName } from "@/lib/exam-forms";

import { CandidateForm } from "../candidate-form";
import { loadCandidateForm } from "../load";

export const metadata: Metadata = { title: "เพิ่มรายชื่อผู้สมัคร" };
export const dynamic = "force-dynamic";

export default async function NewCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/exams");
  const { id } = await params;
  const { batch, mode, titles } = await loadCandidateForm(id);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/exams/batches/${batch.id}`} className="text-primary underline underline-offset-4">
          ← บัญชี {batch.place.name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">เพิ่มรายชื่อผู้สมัครทีละคน</h1>
      <p className="mt-1 text-muted-foreground">
        {examName(batch.round.exam_type, batch.round.level)} {batch.round.year_be} · แบบ {batch.template.code} · สนามสอบ {batch.venue.name}
      </p>
      <CandidateForm
        batchId={batch.id}
        candidateId={null}
        columns={batch.template.columns}
        initial={{}}
        maskedNid={null}
        titles={titles}
        mode={mode}
        strict={batch.status !== "draft"}
      />
    </section>
  );
}
