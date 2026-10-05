"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Pencil } from "lucide-react";

import { ErrorText, Field, FormMessages, SubmitButton, useServerForm } from "@/components/form";
import { SearchPicker } from "@/components/search-picker";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { VenueOfficer } from "@/lib/venues-server";
import { OFFICER_ROLE_LABEL, type OfficerRole } from "@/lib/venues";

import { searchResponsiblePersons } from "../../actions";
import { removeVenueOfficer, saveVenueOfficer } from "../actions";

function OfficerForm({
  venueId,
  yearId,
  role,
  officer,
  onDone,
}: {
  venueId: string;
  yearId: string;
  role: OfficerRole;
  officer: VenueOfficer | null;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useServerForm(async (prev, formData) => {
    const result = await saveVenueOfficer(prev, formData);
    if (result?.message) onDone();
    return result;
  });
  const label = OFFICER_ROLE_LABEL[role];
  const [isPublic, setIsPublic] = useState(officer?.is_public ?? false);
  const [phonePublic, setPhonePublic] = useState(officer?.is_phone_public ?? false);
  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={officer?.id ?? ""} />
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="academic_year_id" value={yearId} />
      <input type="hidden" name="role" value={role} />
      <SearchPicker
        name="person_id"
        label={label}
        placeholder="พิมพ์ชื่อหรือฉายา อย่างน้อย 2 ตัวอักษร"
        initial={officer ? { id: officer.person_id, label: officer.person_name, detail: officer.person_unit_name } : null}
        search={searchResponsiblePersons}
        required
        hint="เลือกจากทะเบียนบุคคลที่ท่านมีสิทธิ์ดู"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${role}-delivery`}
          label="ที่อยู่สำหรับจัดส่งข้อสอบ"
          name="delivery_address"
          defaultValue={officer?.delivery_address ?? ""}
          className="sm:col-span-2"
          hint="เว้นว่างได้ถ้าจัดส่งที่ที่ตั้งสนามสอบ"
        />
        <Field
          id={`${role}-phone`}
          label="เบอร์ติดต่อ"
          name="contact_phone"
          inputMode="tel"
          defaultValue={officer?.contact_phone ?? ""}
        />
        <Field id={`${role}-note`} label="หมายเหตุ" name="note" defaultValue={officer?.note ?? ""} />
      </div>
      <fieldset className="flex flex-col gap-2 rounded-md border border-input p-3">
        <legend className="px-1 font-medium">การเผยแพร่บนหน้าทะเบียนสาธารณะ</legend>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="is_public"
            checked={isPublic}
            onChange={(e) => {
              setIsPublic(e.target.checked);
              if (!e.target.checked) setPhonePublic(false);
            }}
            className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
          />
          <span>ยินยอมให้เผยแพร่ชื่อ{label}</span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="is_phone_public"
            checked={phonePublic}
            disabled={!isPublic}
            onChange={(e) => setPhonePublic(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
          />
          <span>
            ยินยอมให้เผยแพร่เบอร์ติดต่อด้วย
            <span className="block text-sm text-muted-foreground">
              ติ๊กได้เมื่อยินยอมเผยแพร่ชื่อแล้ว ถ้าเป็นเบอร์ส่วนตัว ควรได้รับความยินยอมจากเจ้าของเบอร์ก่อน
            </span>
          </span>
        </label>
        <p className="text-sm text-muted-foreground">
          ค่าเริ่มต้นคือไม่เผยแพร่ทั้งสองอย่าง ที่อยู่สำหรับจัดส่งข้อสอบและหมายเหตุไม่ถูกเผยแพร่ไม่ว่ากรณีใด
        </p>
      </fieldset>
      <FormMessages state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
          บันทึก{label}
        </SubmitButton>
        <Button type="button" variant="outline" onClick={onDone}>
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}

/** กล่องของบทบาทหนึ่ง (ประธานสนามสอบ หรือ ผู้รับข้อสอบ) ในปีการศึกษาที่เลือก */
export function OfficerPanel({
  venueId,
  yearId,
  yearBe,
  role,
  officer,
  canEdit,
  warnMissing,
}: {
  venueId: string;
  yearId: string;
  yearBe: number;
  role: OfficerRole;
  officer: VenueOfficer | null;
  canEdit: boolean;
  /** สนามเปิดอยู่และเป็นปีปัจจุบันหรือปีถัดไป จึงเตือนเมื่อยังไม่มีรายชื่อ */
  warnMissing: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = OFFICER_ROLE_LABEL[role];

  const remove = () => {
    if (!officer) return;
    if (!window.confirm(`นำ ${officer.person_name} ออกจาก${label}ของปีการศึกษา ${yearBe} ใช่หรือไม่ (ข้อมูลไม่ถูกลบ และยังอยู่ในประวัติการแก้ไข)`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeVenueOfficer(officer.id, venueId);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5" data-testid={`officer-${role}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-primary">{label}</h3>
        {canEdit && !editing ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {officer ? "แก้ไข" : `ระบุ${label}`}
            </Button>
            {officer ? (
              <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
                นำออก
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <ErrorText>{error}</ErrorText>

      {editing ? (
        <OfficerForm
          key={officer?.id ?? "new"}
          venueId={venueId}
          yearId={yearId}
          role={role}
          officer={officer}
          onDone={() => setEditing(false)}
        />
      ) : officer ? (
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[11rem_1fr]">
          <dt className="font-semibold">ชื่อ</dt>
          <dd>
            {officer.person_name}{" "}
            {officer.person_status === "inactive" ? (
              <span className="rounded-full border border-red-300 bg-red-100 px-3 py-0.5 text-sm font-semibold text-red-900">
                ถูกปิดใช้งานในทะเบียนบุคคล
              </span>
            ) : officer.person_status !== "active" ? (
              <StatusBadge status={officer.person_status} personType={officer.person_type} />
            ) : null}
            <span className="block text-sm text-muted-foreground">สังกัด {officer.person_unit_name}</span>
          </dd>
          <dt className="font-semibold">ที่อยู่จัดส่งข้อสอบ</dt>
          <dd>{officer.delivery_address || "-"}</dd>
          <dt className="font-semibold">เบอร์ติดต่อ</dt>
          <dd>{officer.contact_phone || "-"}</dd>
          <dt className="font-semibold">การเผยแพร่</dt>
          <dd>
            {officer.is_public
              ? officer.is_phone_public
                ? "ยินยอมให้เผยแพร่ชื่อและเบอร์ติดต่อ"
                : "ยินยอมให้เผยแพร่ชื่อ (ไม่เผยแพร่เบอร์ติดต่อ)"
              : "ไม่เผยแพร่"}
          </dd>
          {officer.note ? (
            <>
              <dt className="font-semibold">หมายเหตุ</dt>
              <dd>{officer.note}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className={warnMissing ? "mt-2 flex items-center gap-2 font-semibold text-destructive" : "mt-2 text-muted-foreground"}>
          {warnMissing ? <AlertTriangle aria-hidden className="size-5" /> : null}
          ยังไม่มี{label}ของปีการศึกษา {yearBe}
        </p>
      )}
      {officer && officer.person_status !== "active" && !editing ? (
        <p className="mt-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-amber-950">
          สถานะของบุคคลนี้ในทะเบียนบุคคลเปลี่ยนไปแล้ว กรุณาตรวจสอบว่ายังทำหน้าที่{label}ได้หรือไม่ ถ้าไม่ได้ให้กด แก้ไข
          แล้วเลือกคนใหม่
        </p>
      ) : null}
    </div>
  );
}
