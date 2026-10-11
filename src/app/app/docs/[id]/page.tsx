import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import { Attachments } from "@/components/attachments";
import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import {
  currentYearBe,
  DELIVERY_STATUS_LABEL,
  DOC_CLASS_LABEL,
  DOC_KIND_LABEL,
  DOC_STATUS_LABEL,
  DOC_URGENCY_LABEL,
  type DocDetail,
} from "@/lib/docs";
import { fetchDocumentDetail, fetchViewerCandidates } from "@/lib/docs-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { CancelForm, DiscardButton, IssueForm, SendButton, ViewersForm } from "../doc-forms";
import { docsQuery } from "../scope";
import { DocBadges } from "../ui";

export const metadata: Metadata = { title: "หนังสือ" };
export const dynamic = "force-dynamic";

function heading(d: DocDetail) {
  if (d.direction === "receive") return `หนังสือรับ เลขทะเบียนรับ ${d.seq_no}/${d.number_year}`;
  if (d.status === "draft") return "ร่างหนังสือส่ง";
  return `หนังสือส่ง ที่ ${d.doc_no}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[12rem_1fr]">
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function Panel({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="mt-6 rounded-xl border bg-card p-5" data-testid={testId}>
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** หน้าหนังสือ: รายละเอียด ไฟล์แนบ และการดำเนินการตามสถานะ (ออกเลข ส่ง ยกเลิก ระบุผู้เห็นหนังสือลับ) */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMenu("/app/docs");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await fetchDocumentDetail(id);
  if (!d) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold text-primary">ไม่พบหนังสือ</h1>
        <p role="alert" className="mt-3" data-testid="doc-hidden">
          ไม่พบหนังสือนี้ หรือท่านไม่มีสิทธิ์เห็น (หนังสือลับเห็นเฉพาะผู้ที่ระบุชื่อและผู้ลงทะเบียน)
        </p>
        <p className="mt-3">
          <Link href="/app/docs" className="text-primary underline underline-offset-4">
            ← สารบรรณ
          </Link>
        </p>
      </section>
    );
  }
  const send = d.direction === "send";
  const tab = send ? (d.status === "draft" ? "draft" : "send") : "receive";
  const secret = d.classification !== "normal";
  const canEdit = d.can_edit && d.status !== "cancelled";
  const candidates = canEdit && secret ? await fetchViewerCandidates(d.org_unit_id) : [];
  const anyReceived = d.deliveries.some((x) => x.status === "received");
  const editable = canEdit && (d.status === "draft" || d.status === "issued" || d.status === "received");

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/docs?${docsQuery(d.org_unit_id, { tab, year: d.number_year })}`} className="text-primary underline underline-offset-4">
          ← {send ? (d.status === "draft" ? "ร่างหนังสือ" : "ทะเบียนหนังสือส่ง") : "ทะเบียนหนังสือรับ"}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl" data-testid="doc-heading">
            {heading(d)}
          </h1>
          <p className="mt-1">
            <DocBadges urgency={d.urgency} classification={d.classification} />
            <span className={cn("font-semibold", d.status === "cancelled" && "text-destructive")} data-testid="doc-status">
              {DOC_STATUS_LABEL[d.status]}
            </span>
            <span className="text-muted-foreground"> · {d.org_unit_name}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button asChild variant="outline">
              <Link href={`/app/docs/${d.id}/edit`}>แก้ไข</Link>
            </Button>
          ) : null}
          {send ? (
            <Button asChild variant="outline">
              <a href={`/app/docs/${d.id}/print`} target="_blank" rel="noopener">
                <Printer aria-hidden />
                หน้าพิมพ์ A4
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {d.status === "cancelled" ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3" data-testid="cancel-info">
          ยกเลิกแล้วเมื่อ {thaiDateTime(d.cancelled_at)} โดย {d.cancelled_by_name ?? "-"} เหตุผล: {d.cancel_reason}
          {send ? " (เลขนี้ไม่ถูกนำกลับมาใช้)" : ""}
        </p>
      ) : null}

      <Panel title="รายละเอียด" testId="doc-info">
        <dl>
          <Row label="ชนิด">{DOC_KIND_LABEL[d.kind]}</Row>
          {send ? null : <Row label="เลขทะเบียนรับ">{`${d.seq_no}/${d.number_year}`}</Row>}
          <Row label="ที่">{d.doc_no || (d.status === "draft" ? "(ยังไม่ออกเลข)" : "-")}</Row>
          <Row label="ลงวันที่">{thaiDate(d.doc_date)}</Row>
          <Row label="จาก">{d.from_text || "-"}</Row>
          <Row label="ถึง">
            {[d.salutation, d.to_text].filter(Boolean).join(" ") || "-"}
            {d.to_units.length ? <span className="block text-sm text-muted-foreground">หน่วยในระบบ: {d.to_units.map((u) => u.name).join(", ")}</span> : null}
          </Row>
          <Row label="เรื่อง">{d.subject}</Row>
          <Row label="ชั้นความเร็ว">{DOC_URGENCY_LABEL[d.urgency]}</Row>
          <Row label="ชั้นความลับ">{secret ? DOC_CLASS_LABEL[d.classification] : "-"}</Row>
          {d.source ? (
            <Row label="ส่งผ่านระบบจาก">
              {d.source.unit_name} ที่ {d.source.doc_no}
            </Row>
          ) : null}
          {d.received_at ? <Row label="วันเวลารับ">{thaiDateTime(d.received_at)}</Row> : null}
          <Row label={send ? "ผู้ร่าง" : "ผู้ลงทะเบียนรับ"}>{d.registered_by_name ?? "-"}</Row>
          {d.issued_at ? <Row label="ออกเลข">{`${thaiDateTime(d.issued_at)} โดย ${d.issued_by_name ?? "-"}`}</Row> : null}
          {d.sent_at ? <Row label="ส่ง">{`${thaiDateTime(d.sent_at)} โดย ${d.sent_by_name ?? "-"}`}</Row> : null}
          {d.note ? <Row label={send ? "หมายเหตุภายในหน่วย" : "การปฏิบัติ / หมายเหตุ"}>{d.note}</Row> : null}
          {secret ? (
            <Row label="ผู้ที่ระบุชื่อให้เห็น">{d.viewers.length ? d.viewers.map((v) => v.name).join(", ") : "(ผู้ลงทะเบียนเท่านั้น)"}</Row>
          ) : null}
        </dl>
      </Panel>

      {send && (d.body || d.signer_name) ? (
        <Panel title="เนื้อความ" testId="doc-body">
          <div className="leading-relaxed whitespace-pre-wrap">{d.body || "-"}</div>
          {d.closing ? <p className="mt-3">{d.closing}</p> : null}
          {d.signer_name ? (
            <p className="mt-3">
              ({d.signer_name})
              {d.signer_position ? <span className="block">{d.signer_position}</span> : null}
            </p>
          ) : null}
        </Panel>
      ) : null}

      {send && d.deliveries.length ? (
        <Panel title="การส่งถึงหน่วยในระบบ" testId="deliveries">
          <ul className="flex flex-col gap-1">
            {d.deliveries.map((x) => (
              <li key={x.id}>
                {x.unit_name} ·{" "}
                <span className={x.status === "received" ? "font-semibold text-emerald-800" : undefined}>{DELIVERY_STATUS_LABEL[x.status]}</span>
                {x.status === "received" ? ` เลขรับ ${x.receive_no}/${x.receive_year} เมื่อ ${thaiDateTime(x.received_at)}` : ""}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="ไฟล์แนบ" testId="doc-files">
        <Attachments
          entityTable="documents"
          entityId={d.id}
          orgUnitId={d.org_unit_id}
          currentUserId={ctx.user.id}
          canUpload={canEdit}
          inputLabel={send ? "แนบไฟล์ (เช่น PDF ที่ลงนามแล้ว)" : "แนบไฟล์ (เช่น สแกนหนังสือที่รับ)"}
        />
        {d.source ? (
          <div className="mt-4" data-testid="source-files">
            <h3 className="font-semibold">ไฟล์จากหน่วยต้นทาง</h3>
            <Attachments
              entityTable="documents"
              entityId={d.source.id}
              orgUnitId={null}
              currentUserId={ctx.user.id}
              canUpload={false}
              emptyText="ต้นทางไม่ได้แนบไฟล์"
            />
          </div>
        ) : null}
      </Panel>

      {canEdit ? (
        <>
          {d.status === "draft" ? (
            <Panel title="ออกเลขที่หนังสือ" testId="issue-panel">
              <IssueForm id={d.id} kind={d.kind} prefix={d.letterhead?.code_prefix ?? ""} yearBe={currentYearBe()} />
              <div className="mt-4 border-t pt-4">
                <DiscardButton id={d.id} />
              </div>
            </Panel>
          ) : null}
          {d.status === "issued" ? (
            <Panel title="ส่งหนังสือ" testId="send-panel">
              <SendButton id={d.id} unitCount={d.to_units.length} />
            </Panel>
          ) : null}
          {secret ? (
            <Panel title="ผู้ที่ระบุชื่อให้เห็นหนังสือลับ">
              <ViewersForm id={d.id} candidates={candidates} current={d.viewers.map((v) => v.user_id)} selfId={ctx.user.id} />
            </Panel>
          ) : null}
          {d.status !== "draft" && !anyReceived ? (
            <details className="mt-6 rounded-xl border bg-card p-5" data-testid="open-cancel">
              <summary className="cursor-pointer text-lg font-bold text-destructive">{send ? "ยกเลิกเลขที่หนังสือ" : "ยกเลิกการลงรับ"}</summary>
              <div className="mt-3">
                <CancelForm id={d.id} label={send ? "ยกเลิกเลข" : "ยกเลิกการลงรับ"} />
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
