"use client";

import { useState, useTransition } from "react";

import { Attachments } from "@/components/attachments";
import { ErrorText, Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LEVEL_LABEL } from "@/lib/org-units";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import {
  END_REASONS,
  END_REASON_LABEL,
  isCurrentAppointment,
  type Appointment,
  type PositionType,
} from "@/lib/persons";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { addAppointment, cancelAppointment, endAppointment } from "../actions";

/** แท็บตำแหน่ง: ประวัติทุกวาระ เพิ่มวาระใหม่ บันทึกการพ้นตำแหน่ง และแนบคำสั่งหรือตราตั้ง */
export function AppointmentsPanel({
  personId,
  appointments,
  positionTypes,
  units,
  canAdd,
  editableUnitIds,
  currentUserId,
}: {
  personId: string;
  appointments: Appointment[];
  positionTypes: PositionType[];
  units: AccessibleOrgUnit[];
  canAdd: boolean;
  editableUnitIds: string[];
  currentUserId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {canAdd ? <AddForm personId={personId} positionTypes={positionTypes} units={units} /> : null}

      <div>
        <h2 className="text-xl font-bold text-primary">ประวัติการดำรงตำแหน่ง</h2>
        <p className="text-muted-foreground">เก็บทุกวาระ วาระที่พ้นแล้วยังแสดงอยู่ในประวัติ</p>
        {appointments.length === 0 ? (
          <p className="mt-3 text-muted-foreground">ยังไม่มีประวัติการดำรงตำแหน่ง</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3" data-testid="appointments">
            {appointments.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                canEdit={editableUnitIds.includes(a.org_unit_id)}
                currentUserId={currentUserId}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddForm({
  personId,
  positionTypes,
  units,
}: {
  personId: string;
  positionTypes: PositionType[];
  units: AccessibleOrgUnit[];
}) {
  const { state, onSubmit, pending } = useServerForm(addAppointment);
  const [positionKey, setPositionKey] = useState("");
  const [unitId, setUnitId] = useState("");
  const type = positionTypes.find((t) => t.key === positionKey);
  const unit = units.find((u) => u.id === unitId);
  const levelMismatch = type && unit && unit.level !== type.level;

  return (
    <form onSubmit={onSubmit} className="rounded-xl border-2 border-ring bg-card p-5" noValidate data-testid="appointment-form">
      <h2 className="text-xl font-bold text-primary">เพิ่มตำแหน่ง (วาระใหม่)</h2>
      <input type="hidden" name="person_id" value={personId} />
      <div className="mt-3 flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:max-w-md">
          <Label htmlFor="position_type_key">
            ตำแหน่ง<span className="text-destructive"> *</span>
          </Label>
          <select
            id="position_type_key"
            name="position_type_key"
            className={selectClass}
            value={positionKey}
            onChange={(e) => setPositionKey(e.target.value)}
          >
            <option value="">-- เลือกตำแหน่ง --</option>
            {positionTypes
              .filter((t) => t.is_active)
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <p className="mb-2 font-semibold">
            เขตปกครองของตำแหน่ง<span className="text-destructive"> *</span>
          </p>
          <OrgUnitPicker units={units} name="org_unit_id" onChange={setUnitId} required />
          {type ? (
            <p className={cn("mt-1 text-sm", levelMismatch ? "font-medium text-destructive" : "text-muted-foreground")}>
              ตำแหน่ง{type.name} ต้องเลือกเขตให้ถึงระดับ{LEVEL_LABEL[type.level]}พอดี
              {type.max_per_unit ? ` (มีได้ ${type.max_per_unit} รูปต่อหน่วยในเวลาเดียวกัน)` : ""}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ThaiDateInput label="วันที่แต่งตั้ง" name="appointed_on" required />
          <Field label="เลขที่คำสั่งหรือตราตั้ง" name="order_no" hint="แนบไฟล์ได้หลังบันทึก" />
        </div>
        <FormMessages state={state} />
        <div>
          <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
            บันทึกตำแหน่ง
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

function AppointmentCard({
  appointment: a,
  canEdit,
  currentUserId,
}: {
  appointment: Appointment;
  canEdit: boolean;
  currentUserId: string;
}) {
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = isCurrentAppointment(a);
  const badge = !a.is_active
    ? { text: "ยกเลิก (บันทึกผิด)", className: "bg-muted text-muted-foreground" }
    : current
      ? { text: "ดำรงตำแหน่งอยู่", className: "bg-primary text-primary-foreground" }
      : a.ended_on
        ? { text: "พ้นตำแหน่งแล้ว", className: "bg-secondary text-primary" }
        : { text: "ยังไม่ถึงวันแต่งตั้ง", className: "bg-secondary text-primary" };

  const cancel = () => {
    if (!window.confirm("ยกเลิกรายการนี้ใช่หรือไม่ (ใช้กับรายการที่บันทึกผิดเท่านั้น ถ้าพ้นตำแหน่งจริงให้กด \"บันทึกการพ้นตำแหน่ง\")")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await cancelAppointment(a.id, a.person_id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <li className={cn("rounded-xl border bg-card p-4", !a.is_active && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">{a.position_name}</p>
          <p>{a.org_unit_name}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", badge.className)}>{badge.text}</span>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold">วันที่แต่งตั้ง: </dt>
          <dd className="inline">{thaiDate(a.appointed_on)}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">เลขที่คำสั่งหรือตราตั้ง: </dt>
          <dd className="inline">{a.order_no || "-"}</dd>
        </div>
        {a.ended_on ? (
          <>
            <div>
              <dt className="inline font-semibold">วันพ้นตำแหน่ง: </dt>
              <dd className="inline">{thaiDate(a.ended_on)}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">เหตุที่พ้น: </dt>
              <dd className="inline">
                {a.end_reason === "other" ? a.end_note : a.end_reason ? END_REASON_LABEL[a.end_reason] : "-"}
                {a.end_reason !== "other" && a.end_note ? ` (${a.end_note})` : ""}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <details className="mt-3">
        <summary className="cursor-pointer font-semibold text-primary">ไฟล์คำสั่งหรือตราตั้ง</summary>
        <div className="mt-2">
          <Attachments
            entityTable="appointments"
            entityId={a.id}
            orgUnitId={a.org_unit_id}
            currentUserId={currentUserId}
            canUpload={canEdit && a.is_active}
            canRemoveAny={canEdit}
          />
        </div>
      </details>

      {canEdit && a.is_active ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!a.ended_on ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setEnding((v) => !v)} disabled={pending}>
              {ending ? "ปิดแบบบันทึกการพ้นตำแหน่ง" : "บันทึกการพ้นตำแหน่ง"}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={pending}>
            ยกเลิกรายการที่บันทึกผิด
          </Button>
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
      {ending && !a.ended_on ? <EndForm appointment={a} /> : null}
    </li>
  );
}

function EndForm({ appointment: a }: { appointment: Appointment }) {
  const { state, onSubmit, pending } = useServerForm(endAppointment);
  const [reason, setReason] = useState("");

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3 rounded-lg border p-3" noValidate>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="person_id" value={a.person_id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ThaiDateInput label="วันพ้นตำแหน่ง" name="ended_on" required />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`end_reason-${a.id}`}>
            เหตุที่พ้น<span className="text-destructive"> *</span>
          </Label>
          <select
            id={`end_reason-${a.id}`}
            name="end_reason"
            className={selectClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">-- เลือก --</option>
            {END_REASONS.map((r) => (
              <option key={r} value={r}>
                {END_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Field
        label={reason === "other" ? "ระบุเหตุที่พ้น" : "รายละเอียดเพิ่มเติม (ถ้ามี)"}
        name="end_note"
        required={reason === "other"}
      />
      <FormMessages state={state} />
      <div>
        <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
          ยืนยันการพ้นตำแหน่ง
        </SubmitButton>
      </div>
    </form>
  );
}
