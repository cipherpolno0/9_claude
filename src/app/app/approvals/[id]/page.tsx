import type { Metadata } from "next";
import Link from "next/link";
import { Printer } from "lucide-react";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { BudgetTransferSummary } from "@/components/budget-transfer-summary";
import { ErrorText } from "@/components/form";
import { ExamRegistrationSummary } from "@/components/exam-registration-summary";
import { PlaceRequestSummary } from "@/components/place-request-summary";
import { ProfileEditSummary } from "@/components/profile-edit-summary";
import { RequestDocumentList } from "@/components/request-document-list";
import { RequestTimeline } from "@/components/request-timeline";
import { StatusRequestSummary } from "@/components/status-request-summary";
import { Button } from "@/components/ui/button";
import { VenueRequestSummary } from "@/components/venue-request-summary";
import { requireWorkspace } from "@/lib/auth/guards";
import { DEFAULT_STEP_DAYS, isPlaceRequestType, isVenueRequestType, stepDeadline } from "@/lib/place-requests";
import { fetchRequestDocuments } from "@/lib/place-requests-server";
import { EVENT_LABEL } from "@/lib/requests/labels";
import { fetchRequestDetail } from "@/lib/requests/queries";
import { isNoticeType, isStatusType } from "@/lib/status";
import { thaiDate, thaiDateTime } from "@/lib/thai";

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
  // คำขอจัดตั้งและยุบสำนัก (ระบบที่ 4): มีรายการเอกสาร กำหนดเวลาพิจารณา แบบพิมพ์ และฟอร์มแก้ไขของตนเอง
  const placeRequest = isPlaceRequestType(request.type_key) ? request.type_key : null;
  const documents = placeRequest ? await fetchRequestDocuments(request.id) : [];
  const deadline = placeRequest
    ? stepDeadline(request.pendingSince, ctx.settings.place_request_step_days ?? DEFAULT_STEP_DAYS)
    : null;
  const open = request.status === "pending" || request.status === "returned";

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={placeRequest ? "/app/requests" : "/app/approvals"} className="text-primary underline underline-offset-4">
          {placeRequest ? "← คำขอ" : "← งานรอพิจารณาและคำขอของท่าน"}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">{request.title}</h1>
        {placeRequest ? (
          <Button asChild variant="outline">
            <a href={`/app/requests/${request.id}/print`} target="_blank" rel="noopener">
              <Printer aria-hidden />
              พิมพ์แบบคำขอ
            </a>
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-muted-foreground">
        เลขที่ {request.request_no} · {placeRequest ? "เขตคณะสงฆ์" : "หน่วยที่ยื่น"}: {request.org_unit_name} · ผู้ยื่น:{" "}
        {request.requester_name}
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

      {placeRequest ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="mb-2 text-xl font-bold text-primary">รายละเอียดคำขอ</h2>
          {isVenueRequestType(placeRequest) ? (
            <VenueRequestSummary
              typeKey={placeRequest}
              payload={request.payload}
              applied={request.status === "approved"}
              canOpenVenue={ctx.canViewVenues && ctx.allowedMenus.includes("/app/places")}
            />
          ) : (
            <PlaceRequestSummary
              typeKey={placeRequest}
              payload={request.payload}
              applied={request.status === "approved"}
              canOpenPlace={ctx.allowedMenus.includes("/app/places")}
            />
          )}
        </div>
      ) : null}

      {request.type_key === "exam_registration" ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="mb-2 text-xl font-bold text-primary">บัญชีผู้สมัครสอบ</h2>
          <ExamRegistrationSummary payload={request.payload} />
        </div>
      ) : null}

      {request.type_key === "budget_transfer" ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="mb-2 text-xl font-bold text-primary">รายละเอียดคำขอโอนเปลี่ยนแปลงงบประมาณ</h2>
          <BudgetTransferSummary payload={request.payload} applied={request.status === "approved"} />
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
          <h2 className="text-xl font-bold text-primary">
            {request.type_key === "venue_open"
              ? "หมายเหตุ"
              : statusRequest || placeRequest || request.type_key === "budget_transfer"
                ? "เหตุผล"
                : "รายละเอียด"}
          </h2>
          <p className="mt-2 whitespace-pre-wrap">{detail}</p>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">สถานะการพิจารณา</h2>
        {deadline ? (
          <p className="mt-2" data-testid="step-deadline">
            ขั้นที่ {request.current_step} รอพิจารณาตั้งแต่ {thaiDate(deadline.since, "short")} · ครบกำหนด{" "}
            {thaiDate(deadline.dueAt, "short")}{" "}
            {deadline.overdueDays > 0 ? (
              <span
                data-testid="overdue-badge"
                className="rounded border border-destructive px-2 py-0.5 text-sm font-semibold text-destructive"
              >
                เกินกำหนด {deadline.overdueDays} วัน
              </span>
            ) : (
              <span className="text-muted-foreground">(เหลือ {deadline.daysLeft} วัน)</span>
            )}
          </p>
        ) : null}
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
              editHref={
                placeRequest
                  ? `/app/requests/${request.id}/edit`
                  : request.type_key === "exam_registration" && typeof request.payload.batch_id === "string"
                    ? `/app/exams/batches/${request.payload.batch_id}`
                    : request.type_key === "budget_transfer" && typeof request.payload.transfer_id === "string"
                      ? `/app/budget/transfers/${request.payload.transfer_id}`
                      : undefined
              }
            />
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">{placeRequest ? "เอกสารแนบ" : "ไฟล์แนบ"}</h2>
        <div className="mt-3">
          {placeRequest ? (
            <RequestDocumentList
              requestId={request.id}
              orgUnitId={request.org_unit_id}
              currentUserId={ctx.user.id}
              canUpload={isRequester && open}
              documents={documents}
            />
          ) : (
            <Attachments
              entityTable="requests"
              entityId={request.id}
              orgUnitId={request.org_unit_id}
              currentUserId={ctx.user.id}
              canUpload={isRequester && open}
            />
          )}
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
