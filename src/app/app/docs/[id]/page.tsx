import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, Route } from "lucide-react";

import { Attachments } from "@/components/attachments";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import {
  currentYearBe,
  DOC_CLASS_LABEL,
  DOC_KIND_LABEL,
  DOC_STATUS_LABEL,
  DOC_URGENCY_LABEL,
  forwardSummary,
  ROUTE_ACTION_LABEL,
  ROUTE_STATUS_LABEL,
  type DocDetail,
  type DocRoute,
} from "@/lib/docs";
import {
  fetchDocsUnits,
  fetchDocumentDetail,
  fetchRouteCandidates,
  fetchViewerCandidates,
  markDocumentRead,
} from "@/lib/docs-server";
import { fetchAllActiveUnits } from "@/lib/org-units-server";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/requests/labels";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { CloseForm, LinkRequestForm, ReopenForm, UnlinkButton } from "../archive-forms";
import { CancelForm, DiscardButton, IssueForm, SendButton, ViewersForm } from "../doc-forms";
import {
  CancelRouteButton,
  ForwardForm,
  OrderForm,
  ProposeForm,
  ReceiveRouteForm,
  RemindButtons,
  ReplyForm,
  RouteDoneForm,
} from "../route-forms";
import { docsQuery } from "../scope";
import { DocBadges } from "../ui";

export const metadata: Metadata = { title: "หนังสือ" };
export const dynamic = "force-dynamic";

function heading(d: DocDetail) {
  if (d.scope === "recipient") return `หนังสือเข้า${d.doc_no ? ` ที่ ${d.doc_no}` : ""}`;
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

const open = (r: DocRoute) => r.status === "pending" || r.status === "read";

/** เส้นทางภายในหน่วย: เสนอ สั่งการ มอบหมาย แจ้งเพื่อทราบ */
function InternalRoutes({ routes, userId }: { routes: DocRoute[]; userId: string }) {
  return (
    <ol className="flex flex-col gap-3" data-testid="route-list">
      {routes.map((r) => (
        <li key={r.id} className={cn("rounded-lg border p-3", r.action === "order" && "border-primary bg-secondary/40")} data-testid={`route-${r.action}`}>
          <p className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold text-primary">{ROUTE_ACTION_LABEL[r.action]}</span>
            <span>
              {r.from_name ?? "-"}
              {r.action !== "order" ? ` → ${r.to_name ?? "-"}` : ""}
            </span>
            <span className="text-sm text-muted-foreground">{thaiDateTime(r.sent_at)}</span>
          </p>
          {r.message ? <p className="mt-1 whitespace-pre-wrap">{r.message}</p> : null}
          {r.due_on && r.action !== "order" ? <p className="text-sm">กำหนดเสร็จ {thaiDate(r.due_on, "short")}</p> : null}
          {r.action !== "order" ? (
            <p className={cn("text-sm", r.status === "done" ? "text-emerald-800" : r.status === "cancelled" ? "text-destructive" : "text-amber-800")}>
              {r.action === "propose" && r.status === "done" ? "สั่งการแล้ว" : ROUTE_STATUS_LABEL[r.status]}
              {r.done_at ? ` ${thaiDateTime(r.done_at)}` : r.read_at ? ` ${thaiDateTime(r.read_at)}` : ""}
            </p>
          ) : null}
          {r.done_note && r.action === "act" ? <p className="mt-1 rounded-md bg-secondary px-3 py-2">ผลการดำเนินการ: {r.done_note}</p> : null}
          {r.file_count > 0 ? (
            <div className="mt-2">
              <Attachments entityTable="document_routes" entityId={r.id} orgUnitId={null} currentUserId={userId} canUpload={false} />
            </div>
          ) : null}
          {r.can_cancel ? (
            <div className="mt-2">
              <CancelRouteButton routeId={r.id} />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** การส่งถึงหน่วย (หนังสือเวียนแจ้งงาน): ใครเปิดอ่าน ลงรับ ตอบแล้ว */
function ForwardReport({ d, userId }: { d: DocDetail; userId: string }) {
  const routes = d.routes.filter((r) => r.action === "forward");
  const s = forwardSummary(routes);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="forward-summary">
        {[
          ["ส่งถึง", s.total],
          ["เปิดอ่านแล้ว", s.read],
          ["ยังไม่อ่าน", s.unread],
          [d.reply_required ? "ตอบแล้ว" : "ลงรับแล้ว", d.reply_required ? s.replied : s.received],
        ].map(([label, n]) => (
          <div key={label} className="rounded-lg border p-3 text-center">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{Number(n).toLocaleString("th-TH")}</p>
          </div>
        ))}
      </div>
      {d.can_edit && d.status !== "cancelled" && !d.closed_at ? (
        <div className="mt-3">
          <RemindButtons docId={d.id} unread={s.unread} unreplied={d.reply_required ? s.total - s.replied : null} />
        </div>
      ) : null}
      <ul className="mt-3 flex flex-col gap-2" data-testid="forward-list">
        {routes.map((r) => (
          <li key={r.id} className="rounded-lg border p-3" data-testid="forward-row">
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{r.to_name}</span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  r.status === "pending" ? "text-amber-800" : r.status === "cancelled" ? "text-destructive" : "text-emerald-800",
                )}
              >
                {ROUTE_STATUS_LABEL[r.status]}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {r.read_at ? `เปิดอ่าน ${thaiDateTime(r.read_at)}` : "ยังไม่เปิดอ่าน"}
              {r.received_at ? ` · ลงรับ เลขรับ ${r.receive_no}/${r.receive_year} ${thaiDateTime(r.received_at)}` : ""}
            </p>
            {d.reply_required ? (
              r.reply_text ? (
                <div className="mt-2 rounded-md bg-secondary px-3 py-2" data-testid="reply-text">
                  <p className="text-sm text-muted-foreground">
                    ตอบเมื่อ {thaiDateTime(r.replied_at)} โดย {r.replied_by_name ?? "-"}
                  </p>
                  <p className="whitespace-pre-wrap">{r.reply_text}</p>
                  {r.file_count > 0 ? (
                    <Attachments entityTable="document_routes" entityId={r.id} orgUnitId={null} currentUserId={userId} canUpload={false} />
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-sm text-amber-800">ยังไม่ตอบ</p>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/** หน้าหนังสือ: รายละเอียด ไฟล์แนบ เส้นทาง และการดำเนินการตามสิทธิ์ */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  // ผู้ได้รับมอบหมายอาจไม่มีเมนูสารบรรณ ฐานข้อมูลตรวจว่าเห็นหนังสือได้หรือไม่
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await markDocumentRead(id);
  const d = await fetchDocumentDetail(id);
  if (!d) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold text-primary">ไม่พบหนังสือ</h1>
        <p role="alert" className="mt-3" data-testid="doc-hidden">
          ไม่พบหนังสือนี้ หรือท่านไม่มีสิทธิ์เห็น (หนังสือลับเห็นเฉพาะผู้ที่ระบุชื่อและผู้ลงทะเบียน)
        </p>
        <p className="mt-3">
          <Link href="/app/docs/inbox" className="text-primary underline underline-offset-4">
            ← กล่องหนังสือเข้า
          </Link>
        </p>
      </section>
    );
  }
  const owner = d.scope === "owner";
  const send = d.direction === "send";
  const tab = send ? (d.status === "draft" ? "draft" : "send") : "receive";
  const secret = d.classification !== "normal";
  const closed = !!d.closed_at;
  // ปิดเรื่องแล้ว = อยู่ในคลังเก็บ: ทำรายการใดไม่ได้จนกว่าจะเปิดเรื่องใหม่
  const live = d.status !== "cancelled" && !closed;
  const canEdit = d.can_edit && live;
  const forwards = d.routes.filter((r) => r.action === "forward");
  const internal = d.routes.filter((r) => r.action !== "forward");
  const anyReceived = forwards.some((r) => r.status === "received");
  const editable = canEdit && (d.status === "draft" || d.status === "issued" || d.status === "received");
  const myOpen = internal.filter((r) => r.to_user_id === ctx.user.id && open(r));
  const proposeToMe = myOpen.find((r) => r.action === "propose") ?? null;
  const myTasks = myOpen.filter((r) => r.action === "act" || r.action === "inform");
  // หน่วยปลายทาง: เส้นทางที่ส่งถึงหน่วยของผู้ใช้ (ลงรับได้ถ้าเป็นผู้ลงทะเบียนของหน่วยนั้น)
  const myForward = !owner ? (forwards.find((r) => r.mine && open(r)) ?? null) : null;
  const docsUnits = myForward ? await fetchDocsUnits() : [];
  const canReceive = myForward ? docsUnits.some((u) => u.id === myForward.to_unit_id && u.can_edit) : false;
  const canForward = canEdit && d.direction === "receive" && d.status === "received";
  const replyRoute = owner && d.source_route?.reply_required && canEdit ? d.source_route : null;
  const [viewerCandidates, commanders, members, allUnits] = await Promise.all([
    canEdit && secret ? fetchViewerCandidates(d.org_unit_id) : Promise.resolve([]),
    owner && live && d.status !== "draft" ? fetchRouteCandidates(d.id, "commanders") : Promise.resolve([]),
    owner && live && d.can_command ? fetchRouteCandidates(d.id, "members") : Promise.resolve([]),
    canForward ? fetchAllActiveUnits() : Promise.resolve([]),
  ]);
  const otherCommanders = commanders.filter((c) => c.user_id !== ctx.user.id);
  const backHref = owner && d.can_view_unit
    ? `/app/docs?${docsQuery(d.org_unit_id, closed ? { tab: "archive" } : { tab, year: d.number_year })}`
    : "/app/docs/inbox";
  const canClose = owner && canEdit && (d.status === "sent" || d.status === "received");
  const showRequests = owner && (d.requests.length > 0 || d.requests_hidden > 0 || (d.can_view_unit && d.status !== "draft" && d.status !== "cancelled"));

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={backHref} className="text-primary underline underline-offset-4">
          ← {owner && d.can_view_unit
            ? closed
              ? "คลังเก็บ"
              : send
                ? d.status === "draft"
                  ? "ร่างหนังสือ"
                  : "ทะเบียนหนังสือส่ง"
                : "ทะเบียนหนังสือรับ"
            : "กล่องหนังสือเข้า"}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl" data-testid="doc-heading">
            {heading(d)}
          </h1>
          <p className="mt-1">
            <DocBadges urgency={d.urgency} classification={d.classification} />
            {owner ? (
              <span className={cn("font-semibold", d.status === "cancelled" && "text-destructive")} data-testid="doc-status">
                {DOC_STATUS_LABEL[d.status]}
                {closed ? " · ปิดเรื่องแล้ว" : ""}
              </span>
            ) : null}
            <span className="text-muted-foreground">
              {owner ? " · " : ""}
              {d.org_unit_name}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.status !== "draft" ? (
            <Button asChild variant="outline">
              <Link href={`/app/docs/${d.id}/track`} prefetch={false} data-testid="track-link">
                <Route aria-hidden />
                ติดตามหนังสือ
              </Link>
            </Button>
          ) : null}
          {editable ? (
            <Button asChild variant="outline">
              <Link href={`/app/docs/${d.id}/edit`}>แก้ไข</Link>
            </Button>
          ) : null}
          {send && owner ? (
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
          ยกเลิกแล้วเมื่อ {thaiDateTime(d.cancelled_at)}
          {owner ? ` โดย ${d.cancelled_by_name ?? "-"} เหตุผล: ${d.cancel_reason}` : ""}
          {send && owner ? " (เลขนี้ไม่ถูกนำกลับมาใช้)" : ""}
        </p>
      ) : null}

      {closed && owner ? (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950" data-testid="closed-info">
          <p className="font-semibold">
            ปิดเรื่องแล้วเมื่อ {thaiDateTime(d.closed_at)} โดย {d.closed_by_name ?? "-"} (อยู่ในคลังเก็บ)
          </p>
          {d.close_note ? <p>บันทึก: {d.close_note}</p> : null}
          <p data-testid="retention-info">
            {d.retention_years
              ? `อายุการเก็บ ${d.retention_years} ปี นับจากวันปิดเรื่อง ครบวันที่ ${thaiDate(d.retain_until)}`
              : "ชนิดหนังสือนี้ยังไม่กำหนดอายุการเก็บ (ผู้ดูแลระบบตั้งได้ที่ อายุการเก็บหนังสือ)"}
          </p>
          {d.can_edit ? (
            <details className="mt-3" data-testid="open-reopen">
              <summary className="cursor-pointer font-semibold text-primary">เปิดเรื่องใหม่</summary>
              <div className="mt-2 rounded-lg bg-card p-3 text-foreground">
                <ReopenForm id={d.id} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {myForward ? (
        <div className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950" data-testid="recipient-box">
          <p className="font-semibold">
            หนังสือจาก {myForward.from_unit_name} ส่งถึง {myForward.to_name} เมื่อ {thaiDateTime(myForward.sent_at)}
          </p>
          {myForward.message ? <p>ข้อความ: {myForward.message}</p> : null}
          {d.reply_required ? (
            <p className="font-semibold">ต้องตอบกลับ{d.reply_due_on ? ` ภายใน ${thaiDate(d.reply_due_on, "short")}` : ""} (ลงรับแล้วตอบในหน้าหนังสือที่ลงรับ)</p>
          ) : null}
          {canReceive ? <ReceiveRouteForm routeId={myForward.id} /> : <p className="mt-1 text-sm">เจ้าหน้าที่สารบรรณของหน่วยเป็นผู้ลงรับ</p>}
        </div>
      ) : null}

      <Panel title="รายละเอียด" testId="doc-info">
        <dl>
          <Row label="ชนิด">{DOC_KIND_LABEL[d.kind]}</Row>
          {!send && owner ? <Row label="เลขทะเบียนรับ">{`${d.seq_no}/${d.number_year}`}</Row> : null}
          <Row label="ที่">{d.doc_no || (d.status === "draft" ? "(ยังไม่ออกเลข)" : "-")}</Row>
          <Row label="ลงวันที่">{thaiDate(d.doc_date)}</Row>
          <Row label="จาก">{d.from_text || d.org_unit_name}</Row>
          <Row label="ถึง">
            {[d.salutation, d.to_text].filter(Boolean).join(" ") || "-"}
            {d.to_units.length ? (
              <span className="block text-sm text-muted-foreground">
                หน่วยในระบบ {d.to_units.length.toLocaleString("th-TH")} หน่วย: {d.to_units.slice(0, 10).map((u) => u.name).join(", ")}
                {d.to_units.length > 10 ? " ..." : ""}
              </span>
            ) : null}
          </Row>
          <Row label="เรื่อง">{d.subject}</Row>
          <Row label="ชั้นความเร็ว">{DOC_URGENCY_LABEL[d.urgency]}</Row>
          <Row label="ชั้นความลับ">{secret ? DOC_CLASS_LABEL[d.classification] : "-"}</Row>
          {send && d.reply_required ? (
            <Row label="ต้องการคำตอบ">{d.reply_due_on ? `ตอบภายใน ${thaiDate(d.reply_due_on)}` : "ใช่ (ไม่กำหนดวัน)"}</Row>
          ) : null}
          {d.source ? (
            <Row label="ส่งผ่านระบบจาก">
              {d.source.unit_name} ที่ {d.source.doc_no}
            </Row>
          ) : null}
          {d.received_at ? <Row label="วันเวลารับ">{thaiDateTime(d.received_at)}</Row> : null}
          {owner ? <Row label={send ? "ผู้ร่าง" : "ผู้ลงทะเบียนรับ"}>{d.registered_by_name ?? "-"}</Row> : null}
          {d.issued_at && owner ? <Row label="ออกเลข">{`${thaiDateTime(d.issued_at)} โดย ${d.issued_by_name ?? "-"}`}</Row> : null}
          {d.sent_at && owner ? <Row label="ส่ง">{`${thaiDateTime(d.sent_at)} โดย ${d.sent_by_name ?? "-"}`}</Row> : null}
          {d.note && owner ? <Row label={send ? "หมายเหตุภายในหน่วย" : "การปฏิบัติ / หมายเหตุ"}>{d.note}</Row> : null}
          {secret && owner ? (
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

      {replyRoute ? (
        <Panel title={`ตอบกลับ ${replyRoute.from_unit_name}`} testId="reply-panel">
          {replyRoute.reply_due_on ? <p className="mb-2">ตอบภายใน {thaiDate(replyRoute.reply_due_on)}</p> : null}
          {replyRoute.replied_at ? <p className="mb-2 text-sm text-emerald-800">ตอบแล้วเมื่อ {thaiDateTime(replyRoute.replied_at)} (แก้คำตอบได้)</p> : null}
          <ReplyForm routeId={replyRoute.id} unitId={d.org_unit_id} currentUserId={ctx.user.id} initial={replyRoute.reply_text} />
        </Panel>
      ) : null}

      {myTasks.map((r) => (
        <Panel key={r.id} title={r.action === "act" ? "งานที่ท่านได้รับมอบหมาย" : "แจ้งเพื่อทราบถึงท่าน"} testId={`my-${r.action}`}>
          <p>
            จาก {r.from_name ?? "-"}: {r.message}
          </p>
          {r.due_on ? <p className="text-sm">กำหนดเสร็จ {thaiDate(r.due_on)}</p> : null}
          <div className="mt-3">
            <RouteDoneForm routeId={r.id} action={r.action === "act" ? "act" : "inform"} unitId={d.org_unit_id} currentUserId={ctx.user.id} />
          </div>
        </Panel>
      ))}

      {owner && live && d.can_command ? (
        proposeToMe ? (
          <Panel title="สั่งการเรื่องที่เสนอถึงท่าน" testId="order-panel">
            <p className="mb-3 rounded-md bg-secondary px-3 py-2">
              {proposeToMe.from_name} เสนอ: {proposeToMe.message}
            </p>
            <OrderForm docId={d.id} members={members} parentId={proposeToMe.id} parentFrom={proposeToMe.from_name} />
          </Panel>
        ) : (
          <details className="mt-6 rounded-xl border bg-card p-5" data-testid="open-order">
            <summary className="cursor-pointer text-lg font-bold text-primary">สั่งการ / มอบหมายผู้ดำเนินการ</summary>
            <div className="mt-3">
              <OrderForm docId={d.id} members={members} parentId={null} />
            </div>
          </details>
        )
      ) : null}

      {owner && live && d.status !== "draft" && otherCommanders.length ? (
        <details className="mt-6 rounded-xl border bg-card p-5" data-testid="open-propose">
          <summary className="cursor-pointer text-lg font-bold text-primary">เสนอผู้สั่งการ</summary>
          <div className="mt-3">
            <ProposeForm docId={d.id} commanders={otherCommanders} />
          </div>
        </details>
      ) : null}

      {canForward ? (
        <details className="mt-6 rounded-xl border bg-card p-5" data-testid="open-forward">
          <summary className="cursor-pointer text-lg font-bold text-primary">ส่งต่อถึงหน่วยอื่น</summary>
          <div className="mt-3">
            <ForwardForm docId={d.id} units={allUnits} ownUnitId={d.org_unit_id} />
          </div>
        </details>
      ) : null}

      {owner && internal.length ? (
        <Panel title="เส้นทางหนังสือภายในหน่วย" testId="routes-panel">
          <InternalRoutes routes={internal} userId={ctx.user.id} />
        </Panel>
      ) : null}

      {owner && forwards.length ? (
        <Panel title={d.direction === "send" ? "การส่งถึงหน่วยในระบบ" : "การส่งต่อถึงหน่วยอื่น"} testId="deliveries">
          <ForwardReport d={d} userId={ctx.user.id} />
        </Panel>
      ) : null}

      {showRequests ? (
        <Panel title="คำขอที่เกี่ยวข้อง" testId="doc-requests">
          {d.requests.length ? (
            <ul className="flex flex-col gap-2">
              {d.requests.map((r) => (
                <li key={r.link_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <span className="min-w-0">
                    <Link href={`/app/approvals/${r.request_id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                      {r.request_no}
                    </Link>{" "}
                    {r.title}
                    <span className="block text-sm text-muted-foreground">
                      {r.type_name} · {REQUEST_STATUS_LABEL[r.status as RequestStatus] ?? r.status}
                      {r.source === "auto" ? " · ระบบสร้างร่างแจ้งผลจากคำขอนี้" : ""}
                    </span>
                  </span>
                  {r.can_remove && r.source === "manual" ? <UnlinkButton linkId={r.link_id} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">ยังไม่มีคำขอที่อ้างอิงหนังสือนี้</p>
          )}
          {d.requests_hidden > 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">มีคำขออีก {d.requests_hidden} รายการที่ท่านไม่มีสิทธิ์เห็น</p>
          ) : null}
          {d.can_view_unit && live && d.status !== "draft" ? (
            <details className="mt-3" data-testid="open-link-request">
              <summary className="cursor-pointer font-semibold text-primary">อ้างอิงคำขอ</summary>
              <div className="mt-2">
                <LinkRequestForm docId={d.id} />
              </div>
            </details>
          ) : null}
        </Panel>
      ) : null}

      {canClose ? (
        <details className="mt-6 rounded-xl border bg-card p-5" data-testid="open-close">
          <summary className="cursor-pointer text-lg font-bold text-primary">ปิดเรื่อง (ย้ายเข้าคลังเก็บ)</summary>
          <div className="mt-3">
            <CloseForm id={d.id} openWork={d.open_work} />
          </div>
        </details>
      ) : null}

      {canEdit && owner ? (
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
              <ViewersForm id={d.id} candidates={viewerCandidates} current={d.viewers.map((v) => v.user_id)} selfId={ctx.user.id} />
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
