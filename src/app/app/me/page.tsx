import type { Metadata } from "next";
import Link from "next/link";

import { requireWorkspace } from "@/lib/auth/guards";
import { SCHOOL_TYPE_LABEL, STAFF_STATUS_LABEL, TRACK_LABEL } from "@/lib/education";
import { fetchEducationStaff } from "@/lib/education-server";
import { PERSON_COLUMNS, isCurrentAppointment, personName, type Person } from "@/lib/persons";
import { fetchAppointments } from "@/lib/persons-server";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/requests/labels";
import { createClient } from "@/lib/supabase/server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

import { PersonFacts } from "../personnel/person-facts";
import { ProfileEditForm } from "./profile-edit-form";

export const metadata: Metadata = { title: "ประวัติของฉัน" };
export const dynamic = "force-dynamic";

type MyRequest = { id: string; request_no: string; status: RequestStatus; submitted_at: string };

export default async function MyProfilePage() {
  const ctx = await requireWorkspace();
  const supabase = await createClient();
  // บุคคลในทะเบียนที่ผูกกับบัญชีนี้ (RLS ให้เจ้าของบัญชีเห็นประวัติของตนเอง)
  const { data } = await supabase
    .from("persons")
    .select(`${PERSON_COLUMNS}, org_units(name)`)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (!data) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">ประวัติของฉัน</h1>
        <div className="mt-6 rounded-xl border-2 border-dashed border-input bg-secondary px-6 py-8" data-testid="me-unlinked">
          <p className="text-lg font-semibold text-primary">บัญชีของท่านยังไม่ได้ผูกกับทะเบียนบุคคล</p>
          <p className="text-muted-foreground">
            กรุณาแจ้งเลขานุการเจ้าคณะของเขตที่ท่านสังกัด ให้ผูกบัญชีนี้ ({ctx.user.email}) กับประวัติของท่านในทะเบียนบุคคล
            แล้วท่านจะดูประวัติและยื่นขอแก้ไขข้อมูลได้ที่หน้านี้
          </p>
        </div>
      </section>
    );
  }

  const { org_units, ...person } = data as unknown as Person & { org_units: { name: string } | null };
  const [appointments, education, requestsRes] = await Promise.all([
    fetchAppointments(person.id),
    fetchEducationStaff(person.id),
    supabase
      .from("requests")
      .select("id, request_no, status, submitted_at")
      .eq("requester_id", ctx.user.id)
      .eq("type_key", "profile_edit")
      .order("submitted_at", { ascending: false })
      .limit(20),
  ]);
  const requests = (requestsRes.data as MyRequest[] | null) ?? [];
  const openRequest = requests.find((r) => r.status === "pending" || r.status === "returned");
  const current = appointments.filter((a) => isCurrentAppointment(a));
  const staff = education.filter((e) => e.is_active);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ประวัติของฉัน</h1>
      <p className="mt-1 text-muted-foreground">{personName(person)} · ข้อมูลตามทะเบียนบุคคล</p>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ข้อมูลทั่วไป</h2>
        <dl className="mt-2" data-testid="me-general">
          <PersonFacts person={person} unitName={org_units?.name ?? ""} />
        </dl>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5" data-testid="me-education">
        <h2 className="text-xl font-bold text-primary">จศป.</h2>
        {staff.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ไม่มีรายการ จศป.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {staff.map((e) => (
              <li key={e.id} className="rounded-lg border p-3">
                <p className="font-semibold">
                  {TRACK_LABEL[e.track]} · {e.position_name} · {STAFF_STATUS_LABEL[e.status]}
                </p>
                <p>
                  {e.school_name || "(ไม่ระบุสำนัก)"}
                  {e.school_type ? ` (${SCHOOL_TYPE_LABEL[e.school_type]})` : ""} · เขตที่รับผิดชอบ: {e.org_unit_name}
                </p>
                <p className="text-muted-foreground">
                  เริ่ม {thaiDate(e.started_on)} · คำสั่งแต่งตั้ง {e.order_no || "-"} · วิชาที่สอน {e.subjects || "-"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ตำแหน่งปกครองปัจจุบัน</h2>
        {current.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ไม่มีตำแหน่งปกครอง</p>
        ) : (
          <ul className="mt-2 list-disc pl-6">
            {current.map((a) => (
              <li key={a.id}>
                {a.position_name} · {a.org_unit_name} (แต่งตั้ง {thaiDate(a.appointed_on)})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-xl border-2 border-ring bg-card p-5" data-testid="me-edit">
        <h2 className="text-xl font-bold text-primary">ขอแก้ไขข้อมูล</h2>
        {openRequest ? (
          <p className="mt-2">
            ท่านมีคำขอแก้ไขประวัติที่ยังไม่ได้ผล:{" "}
            <Link href={`/app/approvals/${openRequest.id}`} className="font-semibold text-primary underline underline-offset-4">
              {openRequest.request_no} ({REQUEST_STATUS_LABEL[openRequest.status]})
            </Link>{" "}
            ต้องรอผลหรือยกเลิกคำขอนี้ก่อนจึงยื่นใหม่ได้
          </p>
        ) : (
          <div className="mt-3">
            <p className="mb-3 text-muted-foreground">
              ถ้าข้อมูลไม่ถูกต้อง ยื่นคำขอแก้ไขได้ คำขอจะส่งถึงเลขานุการ เจ้าคณะ หรือรองเจ้าคณะ ของเขตปกครองที่ท่านสังกัด
            </p>
            <ProfileEditForm person={person} />
          </div>
        )}
        {requests.length > 0 ? (
          <div className="mt-5 border-t pt-4">
            <h3 className="font-bold">คำขอแก้ไขประวัติของท่าน</h3>
            <ul className="mt-2 flex flex-col gap-1" data-testid="me-requests">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/approvals/${r.id}`} className="text-primary underline underline-offset-4">
                    {r.request_no}
                  </Link>{" "}
                  · {REQUEST_STATUS_LABEL[r.status]} · {thaiDateTime(r.submitted_at)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
