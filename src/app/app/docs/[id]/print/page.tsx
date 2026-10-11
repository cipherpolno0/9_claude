import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintPage } from "@/components/print/print-page";
import { requireMenu } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { DOC_KIND_LABEL } from "@/lib/docs";
import { fetchDocumentDetail, fetchEmblemUrl } from "@/lib/docs-server";
import { thaiDate } from "@/lib/thai";

import { Letter } from "./letter";

export const metadata: Metadata = { title: "พิมพ์หนังสือ" };
export const dynamic = "force-dynamic";

/** หน้าพิมพ์หนังสือส่ง A4 ตามแม่แบบหัวหนังสือของหน่วย (ร่างพิมพ์ได้ เลขที่และวันที่เป็นจุดไข่ปลา) */
export default async function PrintDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/docs");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await fetchDocumentDetail(id);
  if (!d || d.direction !== "send") notFound();
  const emblemUrl = await fetchEmblemUrl(d.org_unit_id);
  const draft = d.status === "draft";
  return (
    <PrintPage
      title={draft ? `ร่าง${DOC_KIND_LABEL[d.kind]} ${d.subject}` : `${DOC_KIND_LABEL[d.kind]} ที่ ${d.doc_no}`}
      showHeader={false}
      defaultDigits="thai"
    >
      {draft ? (
        <p className="mb-2 text-center text-sm text-red-700 print:hidden" data-testid="draft-note">
          ร่าง ยังไม่ออกเลข (เลขที่และวันที่จะเติมเมื่อออกเลขแล้ว)
        </p>
      ) : null}
      {d.status === "cancelled" ? (
        <p className="mb-2 text-center text-lg font-bold text-red-700" data-testid="cancelled-note">
          ยกเลิกแล้ว: {d.cancel_reason}
        </p>
      ) : null}
      <Letter
        data={{
          kind: d.kind,
          draft,
          docNo: d.doc_no,
          dateText: thaiDate(d.doc_date),
          // ออกเลขแล้วใช้ชื่อส่วนงาน ณ วันออกเลข (from_text) ร่างใช้ค่าตั้งปัจจุบัน
          agency: (draft ? d.letterhead?.agency_name : d.from_text) || d.letterhead?.agency_name || d.org_unit_name,
          address: d.letterhead?.address ?? "",
          toText: d.to_text,
          salutation: d.salutation,
          subject: d.subject,
          body: d.body,
          closing: d.closing,
          signerName: d.signer_name,
          signerPosition: d.signer_position,
          urgency: d.urgency,
          classification: d.classification,
          emblemUrl,
        }}
      />
    </PrintPage>
  );
}
