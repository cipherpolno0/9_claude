import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { examName } from "@/lib/exam-forms";
import { RESULT_LABEL, isResultCode, type ResultCode, type Scores } from "@/lib/exam-results";
import { fetchResultHistory, fetchResultRounds, isUuid } from "@/lib/exam-results-server";
import { createClient } from "@/lib/supabase/server";
import { thaiDateTime } from "@/lib/thai";

import { ResultForm } from "./result-form";

export const metadata: Metadata = { title: "บันทึกผลสอบรายคน" };
export const dynamic = "force-dynamic";

export default async function ResultCandidatePage({ params }: { params: Promise<{ round: string; cid: string }> }) {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) redirect("/app/exams/results/lists");
  const { round: roundId, cid } = await params;
  if (!isUuid(roundId) || !isUuid(cid)) notFound();
  const round = (await fetchResultRounds()).find((r) => r.id === roundId);
  if (!round) notFound();
  const supabase = await createClient();
  const [{ data: cand }, { data: res }, history] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, round_id, candidate_code, title, first_name, monastic_name, last_name, stage, counted")
      .eq("id", cid)
      .maybeSingle(),
    supabase.from("exam_results").select("result, scores, certificate_no, note").eq("candidate_id", cid).maybeSingle(),
    fetchResultHistory(roundId, cid),
  ]);
  if (!cand || cand.round_id !== roundId) notFound();
  const result = res as { result: ResultCode; scores: Scores; certificate_no: string; note: string } | null;
  const back = `/app/exams/results/${roundId}`;
  const name = [cand.title, cand.first_name, cand.monastic_name, cand.last_name].filter(Boolean).join(" ");

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams/results" className="text-primary underline underline-offset-4">
          ผลสอบ
        </Link>{" "}
        /{" "}
        <Link href={back} className="text-primary underline underline-offset-4">
          {examName(round.exam_type, round.level)} {round.year_be}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{name}</h1>
      <p className="mt-1 text-muted-foreground">
        รหัสผู้สมัคร {cand.candidate_code}
        {cand.stage ? ` · ${cand.stage}` : ""} · ผลปัจจุบัน {result && isResultCode(result.result) ? RESULT_LABEL[result.result] : "ยังไม่มีผล"}
      </p>
      <ResultForm
        candidateId={cid}
        backHref={back}
        published={round.result_status === "published"}
        initial={{
          result: result?.result ?? null,
          scores: result?.scores ?? null,
          certificate_no: result?.certificate_no ?? "",
          note: result?.note ?? "",
        }}
      />
      <h2 className="mt-8 text-xl font-bold text-primary">ประวัติการแก้ผล</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-muted-foreground">ยังไม่มีการแก้รายคน (ผลที่นำเข้าจาก Excel บันทึกในประวัติของรอบ)</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2" data-testid="candidate-history">
          {history.map((h, i) => {
            const after = (h.after_data ?? {}) as { result?: string };
            return (
              <li key={i} className="rounded-lg border bg-card px-4 py-2">
                {h.before_data?.result ? RESULT_LABEL[h.before_data.result] : "ยังไม่มีผล"} &gt;{" "}
                {isResultCode(after.result) ? RESULT_LABEL[after.result] : "-"}
                {h.reason ? <span className="block">เหตุผล: {h.reason}</span> : null}
                <span className="block text-sm text-muted-foreground">
                  {thaiDateTime(h.created_at)} · {h.actor_name ?? "ระบบ"}
                  {h.after_publish ? " · แก้หลังประกาศผล" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
