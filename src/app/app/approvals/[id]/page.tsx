import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { ProfileEditSummary } from "@/components/profile-edit-summary";
import { RequestTimeline } from "@/components/request-timeline";
import { requireWorkspace } from "@/lib/auth/guards";
import { EVENT_LABEL } from "@/lib/requests/labels";
import { fetchRequestDetail } from "@/lib/requests/queries";
import { thaiDateTime } from "@/lib/thai";

import { DecisionForm, RequesterActions } from "./request-actions";

export const metadata: Metadata = { title: "รายละเอียดคำขอ" };
export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // ถ้า RLS ไม่ให้เห็นคำขอนี้ จะได้ null และแสดงหน้าไม่พบ
  const request = await fetchRequestDetail(id);
  if (!request) notFound();

  const isRequester = request.requester_id === ctx.user.id;
  const detail = typeof request.payload.detail === "string" ? request.payload.detail : "";

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/approvals" className="text-primary underline underline-offset-4">
          ← งานรอพิจารณาและคำขอของท่าน
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{request.title}</h1>
      <p className="mt-1 text-muted-foreground">
        เลขที่ {request.request_no} · หน่วยที่ยื่น: {request.org_unit_name} · ผู้ยื่น: {request.requester_name}
      </p>

      {request.type_key === "profile_edit" ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-xl font-bold text-primary">รายการที่ขอแก้ไข</h2>
          <ProfileEditSummary payload={request.payload} applied={request.status === "approved"} />
          {!isRequester && typeof request.payload.person_id === "string" ? (
            <p className="mt-3">
              <Link
                href={`/app/personnel/${request.payload.person_id}`}
                className="text-primary underline underline-offset-4"
              >
                เปิดประวัติของบุคคลนี้ในทะเบียนบุคคล
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {detail ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">รายละเอียด</h2>
          <p className="mt-2 whitespace-pre-wrap">{detail}</p>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">สถานะการพิจารณา</h2>
        <div className="mt-3">
          <RequestTimeline data={request.timeline} />
        </div>
      </div>

      {request.canDecide ? (
        <div className="mt-6 rounded-xl border-2 border-ring bg-card p-5">
          <h2 className="text-xl font-bold text-primary">พิจารณาคำขอ (ขั้นที่ {request.current_step})</h2>
          <div className="mt-3">
            <DecisionForm requestId={request.id} />
          </div>
        </div>
      ) : null}

      {isRequester && (request.status === "returned" || request.status === "pending") ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">
            {request.status === "returned" ? "แก้ไขแล้วส่งใหม่" : "คำขอของท่าน"}
          </h2>
          <div className="mt-3">
            <RequesterActions
              requestId={request.id}
              status={request.status}
              title={request.title}
              detail={detail}
              extraPayload={request.type_key === "profile_edit" ? request.payload : undefined}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ไฟล์แนบ</h2>
        <div className="mt-3">
          <Attachments
            entityTable="requests"
            entityId={request.id}
            orgUnitId={request.org_unit_id}
            currentUserId={ctx.user.id}
            canUpload={isRequester && (request.status === "pending" || request.status === "returned")}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ประวัติทั้งหมด</h2>
        <ul className="mt-3 flex flex-col gap-1" data-testid="request-events">
          {request.events.map((e) => (
            <li key={e.id}>
              <span className="text-muted-foreground">{thaiDateTime(e.created_at)}</span> · {EVENT_LABEL[e.action] ?? e.action} ·{" "}
              {e.actor_name}
              {e.comment ? ` · ${e.comment}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
