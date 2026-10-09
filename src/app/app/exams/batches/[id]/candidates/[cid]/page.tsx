import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { candidateName, maskedId, rowSource } from "@/lib/exam-batches";
import { fetchCandidate } from "@/lib/exam-batches-server";

import { CandidateForm } from "../candidate-form";
import { candidateValues, loadCandidateForm } from "../load";

export const metadata: Metadata = { title: "แก้ไขรายชื่อผู้สมัคร" };
export const dynamic = "force-dynamic";

export default async function EditCandidatePage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  await requireMenu("/app/exams");
  const { id, cid } = await params;
  const { batch, mode, titles } = await loadCandidateForm(id);
  const candidate = await fetchCandidate(batch.id, cid);
  if (!candidate) notFound();
  if (candidate.status === "withdrawn") redirect(`/app/exams/batches/${batch.id}?show=withdrawn`);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/exams/batches/${batch.id}`} className="text-primary underline underline-offset-4">
          ← บัญชี {batch.place.name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">แก้ไขรายชื่อ: {candidateName(candidate) || rowSource(candidate)}</h1>
      <p className="mt-1 text-muted-foreground">
        {rowSource(candidate)}
        {candidate.candidate_code ? ` · รหัสผู้สมัคร ${candidate.candidate_code}` : ""}
      </p>
      {candidate.errors.length ? (
        <ul className="mt-3 list-disc rounded-lg border border-destructive bg-destructive/5 py-2 pr-3 pl-8 text-destructive">
          {candidate.errors.map((e, i) => (
            <li key={i}>
              <strong>{e.label}</strong>: {e.message}
            </li>
          ))}
        </ul>
      ) : null}
      <CandidateForm
        batchId={batch.id}
        candidateId={candidate.id}
        columns={batch.template.columns}
        initial={candidateValues(candidate)}
        maskedNid={candidate.national_id_last4 ? maskedId(candidate) : null}
        titles={titles}
        mode={mode}
        strict={batch.status !== "draft" || candidate.counted}
      />
    </section>
  );
}
