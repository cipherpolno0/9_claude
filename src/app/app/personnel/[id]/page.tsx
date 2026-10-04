import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { Attachments } from "@/components/attachments";
import { InfoText } from "@/components/form";
import { HistoryList } from "@/components/record-history";
import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { SCHOOL_TYPE_LABEL, STAFF_STATUS_LABEL, TRACK_LABEL, type StaffStatus, type Track } from "@/lib/education";
import { fetchEducationPositionTypes, fetchEducationStaff } from "@/lib/education-server";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import {
  END_REASON_LABEL,
  NAK_THAM_LABEL,
  PALI_LABEL,
  PERSON_FIELD_LABEL,
  PERSON_STATUS_LABEL,
  PERSON_TYPE_LABEL,
  isCurrentAppointment,
  personName,
  type EndReason,
  type PersonStatus,
  type PersonType,
} from "@/lib/persons";
import {
  editableUnits,
  fetchAppointments,
  fetchPerson,
  fetchPersonPhotoUrl,
  fetchPersonnelHistory,
  fetchPositionTypes,
  isPersonnelEditor,
} from "@/lib/persons-server";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { StatusTimeline } from "@/components/status-timeline";
import { STATUS_TYPES, statusTypeLabel, type StatusType } from "@/lib/status";
import { fetchOpenStatusRequest, fetchStatusChanges, fetchUnitsOfSect } from "@/lib/status-server";
import { createClient } from "@/lib/supabase/server";

import { FactRow, PersonFacts } from "../person-facts";
import { AppointmentsPanel } from "./appointments-panel";
import { EducationPanel } from "./education-panel";
import { LinkAccount } from "./link-account";
import { StatusRequestForm } from "../status-request-form";
import { PersonActiveButton } from "./person-actions";
import { PersonPhoto } from "./person-photo";

export const metadata: Metadata = { title: "ประวัติรายบุคคล" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "general", label: "ข้อมูลทั่วไป" },
  { key: "positions", label: "ตำแหน่ง" },
  { key: "education", label: "จศป." },
  { key: "status", label: "สถานะ" },
  { key: "files", label: "เอกสารแนบ" },
  { key: "history", label: "ประวัติการแก้ไข" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/personnel");
  const { id } = await params;
  const query = await searchParams;
  // ถ้า RLS ไม่ให้เห็นบุคคลนี้ จะได้ null และแสดงหน้าไม่พบ
  const person = await fetchPerson(id);
  if (!person) notFound();

  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "general";
  const [appointments, educationItems] = await Promise.all([fetchAppointments(person.id), fetchEducationStaff(person.id)]);
  const editable = await editableUnits([
    person.org_unit_id,
    ...appointments.map((a) => a.org_unit_id),
    ...educationItems.map((e) => e.org_unit_id),
  ]);
  const canEdit = editable.has(person.org_unit_id);
  const name = personName(person);
  const current = appointments.filter((a) => isCurrentAppointment(a));

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/personnel" className="text-primary underline underline-offset-4">
          ← ทะเบียนบุคคล
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{name}</h1>
          <p className="mt-1 text-muted-foreground">
            {PERSON_TYPE_LABEL[person.person_type]}
            {person.temple_name ? ` · ${person.temple_name}` : ""} · {person.org_unit_name}
            {person.is_active ? "" : " · ปิดใช้งาน"}
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/app/personnel/${person.id}/edit`}>
                <Pencil aria-hidden />
                แก้ไขข้อมูล
              </Link>
            </Button>
            <PersonActiveButton personId={person.id} isActive={person.is_active} />
          </div>
        ) : null}
      </div>

      {query.saved ? (
        <div className="mt-4">
          <InfoText>บันทึกข้อมูลแล้ว</InfoText>
        </div>
      ) : null}

      <nav aria-label="หัวข้อประวัติ" className="mt-6 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/personnel/${person.id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            scroll={false}
            className={cn(
              "rounded-t-md border border-b-0 px-4 py-2 font-semibold",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "general" ? (
          <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6 sm:flex-row">
            <PersonPhoto personId={person.id} url={await fetchPersonPhotoUrl(person.id)} name={name} canEdit={canEdit} />
            <dl className="min-w-0 flex-1 rounded-xl border bg-card px-5 py-2" data-testid="person-general">
              <PersonFacts person={person} unitName={person.org_unit_name} />
              <FactRow label="ตำแหน่งปัจจุบัน">
                {current.length === 0 ? (
                  "-"
                ) : (
                  <ul>
                    {current.map((a) => (
                      <li key={a.id}>
                        {a.position_name} · {a.org_unit_name}
                      </li>
                    ))}
                  </ul>
                )}
              </FactRow>
              <FactRow label="จศป.">
                {educationItems.filter((e) => e.is_active && e.status === "active").length === 0 ? (
                  "-"
                ) : (
                  <ul>
                    {educationItems
                      .filter((e) => e.is_active && e.status === "active")
                      .map((e) => (
                        <li key={e.id}>
                          {TRACK_LABEL[e.track]} · {e.position_name}
                          {e.school_name ? ` · ${e.school_name}` : ""}
                        </li>
                      ))}
                  </ul>
                )}
              </FactRow>
              <FactRow label="หมายเหตุ">{person.note || "-"}</FactRow>
            </dl>
          </div>
            {canEdit ? (
              <LinkAccount
                personId={person.id}
                linked={person.user_id !== null}
                linkedLabel={await linkedAccountLabel(person.user_id)}
              />
            ) : null}
          </div>
        ) : null}

        {tab === "education" ? (
          <EducationPanel
            personId={person.id}
            items={educationItems}
            positionTypes={await fetchEducationPositionTypes()}
            units={isPersonnelEditor(ctx) && person.is_active ? await fetchAccessibleUnits() : []}
            canAdd={isPersonnelEditor(ctx) && person.is_active}
            editableUnitIds={[...editable]}
            currentUserId={ctx.user.id}
          />
        ) : null}

        {tab === "positions" ? (
          <AppointmentsPanel
            personId={person.id}
            appointments={appointments}
            positionTypes={await fetchPositionTypes()}
            units={isPersonnelEditor(ctx) && person.is_active ? await fetchAccessibleUnits() : []}
            canAdd={isPersonnelEditor(ctx) && person.is_active}
            editableUnitIds={[...editable]}
            currentUserId={ctx.user.id}
          />
        ) : null}

        {tab === "status" ? <StatusTab person={person} canEdit={canEdit} isOwner={person.user_id === ctx.user.id} /> : null}

        {tab === "files" ? (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-bold text-primary">เอกสารแนบของบุคคล</h2>
            <p className="mb-3 text-muted-foreground">
              เห็นได้เฉพาะผู้ที่มีสิทธิ์ดูทะเบียนบุคคลของเขตนี้ ไฟล์คำสั่งหรือตราตั้งให้แนบที่แท็บ ตำแหน่ง
            </p>
            <Attachments
              entityTable="persons"
              entityId={person.id}
              orgUnitId={person.org_unit_id}
              currentUserId={ctx.user.id}
              canUpload={canEdit}
              canRemoveAny={canEdit}
            />
          </div>
        ) : null}

        {tab === "history" ? (
          <History personId={person.id} appointments={appointments} educationItems={educationItems} />
        ) : null}
      </div>
    </section>
  );
}

/** แท็บสถานะ: เส้นเวลาสถานะ คำขอที่ยังไม่ได้ผล และแบบยื่นคำขอหรือบันทึกการแจ้ง */
async function StatusTab({
  person,
  canEdit,
  isOwner,
}: {
  person: NonNullable<Awaited<ReturnType<typeof fetchPerson>>>;
  canEdit: boolean;
  isOwner: boolean;
}) {
  const supabase = await createClient();
  const [changes, open, unitRes] = await Promise.all([
    fetchStatusChanges(person.id),
    fetchOpenStatusRequest(person.id),
    supabase.from("org_units").select("sect").eq("id", person.org_unit_id).maybeSingle(),
  ]);

  // ชนิดที่ผู้ใช้คนนี้ยื่นได้ ตามสถานะปัจจุบันของบุคคล (ฐานข้อมูลตรวจซ้ำอีกชั้น)
  const types: StatusType[] = STATUS_TYPES.filter((t) => {
    if (!person.is_active) return false;
    if (t === "transfer" || t === "resign") return (canEdit || isOwner) && person.status === "active";
    if (!canEdit) return false;
    if (t === "other_exit_notice") return person.status === "active";
    if (t === "death_notice") return person.status !== "deceased";
    return person.person_type === "monastic" && person.status !== "deceased" && person.status !== "disrobed";
  });
  const units = !open && types.includes("transfer") ? await fetchUnitsOfSect(unitRes.data?.sect ?? null) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-xl font-bold text-primary">เส้นเวลาสถานะ</h2>
        <StatusTimeline changes={changes} personType={person.person_type} currentStatus={person.status} />
      </div>

      {open ? (
        <div className="rounded-xl border-2 border-ring bg-card p-5" data-testid="status-open-request">
          <h2 className="text-xl font-bold text-primary">รายการที่ยังไม่ได้ผล</h2>
          <p className="mt-2">
            <Link href={`/app/approvals/${open.id}`} className="font-semibold text-primary underline underline-offset-4">
              {open.request_no} · {statusTypeLabel(open.type_key, person.person_type)}
            </Link>{" "}
            ต้องรอผลหรือยกเลิกรายการนี้ก่อน จึงยื่นเรื่องใหม่ได้
          </p>
        </div>
      ) : types.length > 0 ? (
        <div className="rounded-xl border-2 border-ring bg-card p-5">
          <h2 className="text-xl font-bold text-primary">ยื่นคำขอหรือบันทึกการแจ้ง</h2>
          <p className="mb-3 text-muted-foreground">
            ขอย้ายและลาออกต้องได้รับอนุมัติตามสายบังคับบัญชา ส่วนการแจ้งต้องแนบหลักฐานและให้หน่วยเหนือ 1 ชั้นรับทราบ
          </p>
          <StatusRequestForm
            personId={person.id}
            personType={person.person_type}
            types={types}
            units={units}
            fromPlace={person.temple_name}
          />
        </div>
      ) : null}
    </div>
  );
}

/** ชื่อบัญชีที่ผูกกับบุคคล (เห็นเฉพาะบัญชีที่ผู้ใช้ปัจจุบันมีหน้าที่ดูแล) */
async function linkedAccountLabel(userId: string | null): Promise<string> {
  if (!userId) return "";
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("first_name, email").eq("id", userId).maybeSingle();
  return data ? `${data.first_name} (${data.email})` : "บัญชีนอกเขตที่ท่านดูแล";
}

async function History({
  personId,
  appointments,
  educationItems,
}: {
  personId: string;
  appointments: Awaited<ReturnType<typeof fetchAppointments>>;
  educationItems: Awaited<ReturnType<typeof fetchEducationStaff>>;
}) {
  const [logs, units, positionTypes, educationTypes] = await Promise.all([
    fetchPersonnelHistory(personId),
    fetchAccessibleUnits(),
    fetchPositionTypes(),
    fetchEducationPositionTypes(),
  ]);
  const educationTypeName = new Map(educationTypes.map((t) => [t.id, t.name]));
  const educationLabel = new Map(
    educationItems.map((e) => [e.id, `จศป. ${TRACK_LABEL[e.track]}${e.school_name ? ` · ${e.school_name}` : ""}`]),
  );
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const positionName = new Map(positionTypes.map((t) => [t.key, t.name]));
  const appointmentLabel = new Map(appointments.map((a) => [a.id, `ตำแหน่ง${a.position_name} · ${a.org_unit_name}`]));

  const format = (field: string, value: unknown, log: { table_name?: string }): string | null => {
    if (value === null || value === undefined || value === "") return "(ว่าง)";
    const v = String(value);
    switch (field) {
      case "person_type":
        return PERSON_TYPE_LABEL[v as PersonType] ?? v;
      case "status":
        return log.table_name === "education_staff"
          ? (STAFF_STATUS_LABEL[v as StaffStatus] ?? v)
          : (PERSON_STATUS_LABEL[v as PersonStatus] ?? v);
      case "track":
        return TRACK_LABEL[v as Track] ?? v;
      case "school_type":
        return SCHOOL_TYPE_LABEL[v] ?? v;
      case "position_type_id":
        return educationTypeName.get(v) ?? v;
      case "user_id":
        return "(ผูกบัญชี)";
      case "started_on":
        return thaiDate(v);
      case "nak_tham":
        return NAK_THAM_LABEL[v] ?? v;
      case "pali_grade":
        return PALI_LABEL[v] ?? v;
      case "end_reason":
        return END_REASON_LABEL[v as EndReason] ?? v;
      case "position_type_key":
        return positionName.get(v) ?? v;
      case "org_unit_id":
        return unitName.get(v) ?? "(เขตที่ท่านไม่ได้ดูแล)";
      case "birth_date":
      case "ordination_date":
      case "appointed_on":
      case "ended_on":
        return thaiDate(v);
      case "is_active":
        return value === true ? "ใช้งาน" : "ปิดใช้งาน";
      default:
        return null;
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-xl font-bold text-primary">ประวัติการแก้ไข</h2>
      <p className="mb-3 text-muted-foreground">ทุกการเพิ่มและแก้ไขข้อมูลบุคคล ตำแหน่ง และ จศป. ระบบบันทึกไว้อัตโนมัติ</p>
      <HistoryList
        logs={logs.map((l) => ({
          ...l,
          subject:
            l.table_name === "persons"
              ? "ข้อมูลบุคคล"
              : l.table_name === "education_staff"
                ? (educationLabel.get(l.row_id) ?? "จศป.")
                : (appointmentLabel.get(l.row_id) ?? "ตำแหน่ง"),
        }))}
        labels={PERSON_FIELD_LABEL}
        format={format}
      />
    </div>
  );
}
