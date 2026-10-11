import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { currentYearBe } from "@/lib/docs";
import { fetchDocumentDetail, fetchViewerCandidates } from "@/lib/docs-server";
import { fetchAllActiveUnits } from "@/lib/org-units-server";

import { DraftForm, ReceiveForm } from "../../doc-forms";

export const metadata: Metadata = { title: "แก้ไขหนังสือ" };
export const dynamic = "force-dynamic";

/** แก้ไข: ร่างและหนังสือที่ออกเลขแล้วแต่ยังไม่ส่ง / รายละเอียดของหนังสือรับ (เลขทะเบียนแก้ไม่ได้) */
export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMenu("/app/docs");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await fetchDocumentDetail(id);
  if (!d) notFound();
  const send = d.direction === "send";
  const allowed = d.can_edit && (send ? d.status === "draft" || d.status === "issued" : d.status === "received");
  const [units, candidates] =
    allowed && send ? await Promise.all([fetchAllActiveUnits(), fetchViewerCandidates(d.org_unit_id)]) : [[], []];

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/docs/${d.id}`} className="text-primary underline underline-offset-4">
          ← กลับหน้าหนังสือ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">
        {send ? (d.status === "draft" ? "แก้ไขร่างหนังสือ" : `แก้ไขหนังสือ ที่ ${d.doc_no}`) : `แก้ไขหนังสือรับ เลขรับ ${d.seq_no}/${d.number_year}`}
      </h1>
      {!allowed ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          หนังสือนี้แก้ไขไม่ได้ (ส่งแล้ว ยกเลิกแล้ว หรือท่านไม่มีสิทธิ์ลงทะเบียนของหน่วยนี้)
        </p>
      ) : (
        <div className="mt-6 rounded-xl border bg-card p-5">
          {send ? (
            <DraftForm
              unitId={d.org_unit_id}
              units={units}
              candidates={candidates}
              selfId={ctx.user.id}
              prefix={d.letterhead?.code_prefix ?? ""}
              yearBe={currentYearBe()}
              doc={{
                id: d.id,
                status: d.status,
                kind: d.kind,
                toText: d.to_text,
                toUnits: d.to_units,
                subject: d.subject,
                urgency: d.urgency,
                classification: d.classification,
                salutation: d.salutation,
                body: d.body,
                closing: d.closing,
                signerName: d.signer_name,
                signerPosition: d.signer_position,
                note: d.note,
                viewers: d.viewers.map((v) => v.user_id),
                replyRequired: d.reply_required,
                replyDueOn: d.reply_due_on,
              }}
            />
          ) : (
            <ReceiveForm
              unitId={d.org_unit_id}
              candidates={[]}
              selfId={ctx.user.id}
              doc={{
                id: d.id,
                kind: d.kind,
                docNo: d.doc_no,
                docDate: d.doc_date,
                fromText: d.from_text,
                toText: d.to_text,
                subject: d.subject,
                urgency: d.urgency,
                classification: d.classification,
                note: d.note,
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}
