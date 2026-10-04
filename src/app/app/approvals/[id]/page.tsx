import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { ErrorText } from "@/components/form";
import { ProfileEditSummary } from "@/components/profile-edit-summary";
import { RequestTimeline } from "@/components/request-timeline";
import { StatusRequestSummary } from "@/components/status-request-summary";
import { requireWorkspace } from "@/lib/auth/guards";
import { EVENT_LABEL } from "@/lib/requests/labels";
import { fetchRequestDetail } from "@/lib/requests/queries";
import { isNoticeType, isStatusType } from "@/lib/status";
import { thaiDateTime } from "@/lib/thai";

import { DecisionForm, RequesterActions } from "./request-actions";

export const metadata: Metadata = { title: "รายละเอียดคำขอ" };
export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // ถ้า RLS ไม่ให้เห็นคำขอนี้ จะได้ null และแสดงหน้าไม่พบ
  const request = await fetchRequestDetail(id);
  if (!request) notFound();

  const isRequester = request.requester_id === ctx.user.id;
  const detail = typeof request.payload.detail === "string" ? request.payload.detail : "";
  const statusRequest = isStatusType(request.type_key);
  const notice = isNoticeType(request.type_key);
  const uploadFailed = (await searchParams).upload === "failed";

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

      {uploadFailed ? (
        <div className="mt-4">
          <ErrorText>บันทึกรายการแล้ว แต่แนบไฟล์ไม่สำเร็จ กรุณาแนบไฟล์อีกครั้งที่หัวข้อ ไฟล์แนบ ด้านล่าง</ErrorText>
        </div>
      ) : null}

      {statusRequest ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="mb-2 text-xl font-bold text-primary">{notice ? "รายละเอียดการแจ้ง" : "รายละเอียดคำขอ"}</h2>
          <StatusRequestSummary
            typeKey={request.type_key}
            payload={request.payload}
            applied={request.status === "approved"}
          />
        </div>
      ) : null}

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
          <h2 className="text-xl font-bold text-primary">{statusRequest ? "เหตุผล" : "รายละเอียด"}</h2>
          <p className="mt-2 whitespace-pre-wrap">{detail}</p>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">สถานะการพิจารณา</h2>
        <div className="mt-3">
          <RequestTimeline data={request.timeline} approvedLabel={notice ? "รับทราบ" : undefined} />
        </div>
      </div>

      {request.canDecide ? (
        <div className="mt-6 rounded-xl border-2 border-ring bg-card p-5">
          <h2 className="text-xl font-bold text-primary">{notice ? "รับทราบการแจ้ง" : `พิจารณาคำขอ (ขั้นที่ ${request.current_step})`}</h2>
          <div className="mt-3">
            <DecisionForm
              requestId={request.id}
              approveLabel={notice ? "รับทราบ" : undefined}
              allowReject={!notice}
            />
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
              extraPayload={request.type_key === "profile_edit" || statusRequest ? request.payload : undefined}
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
              <span className="text-muted-foreground">{thaiDateTime(e.created_at)}</span> ·{" "}
              {notice && e.action === "approved" ? "รับทราบ" : (EVENT_LABEL[e.action] ?? e.action)} ·{" "}
              {e.actor_name}
              {e.comment ? ` · ${e.comment}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
