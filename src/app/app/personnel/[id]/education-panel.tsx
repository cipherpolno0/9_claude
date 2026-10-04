"use client";

import { useState, useTransition } from "react";

import { Attachments } from "@/components/attachments";
import { ErrorText, Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  SCHOOL_TYPES,
  SCHOOL_TYPE_LABEL,
  STAFF_STATUSES,
  STAFF_STATUS_LABEL,
  TRACKS,
  TRACK_LABEL,
  type EducationPositionType,
  type EducationStaff,
  type Track,
} from "@/lib/education";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { cancelEducationStaff, saveEducationStaff } from "../actions";

/** แท็บ จศป.: รายการของบุคคลนี้ในทุกแท่ง เพิ่ม แก้ไข และแนบคำสั่งแต่งตั้ง */
export function EducationPanel({
  personId,
  items,
  positionTypes,
  units,
  canAdd,
  editableUnitIds,
  currentUserId,
}: {
  personId: string;
  items: EducationStaff[];
  positionTypes: EducationPositionType[];
  units: AccessibleOrgUnit[];
  canAdd: boolean;
  editableUnitIds: string[];
  currentUserId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {canAdd ? (
        <div className="rounded-xl border-2 border-ring bg-card p-5" data-testid="education-form">
          <h2 className="text-xl font-bold text-primary">เพิ่ม จศป.</h2>
          <p className="text-muted-foreground">บุคคลหนึ่งอยู่ได้มากกว่าหนึ่งแท่ง และดำรงตำแหน่งปกครองควบได้</p>
          <div className="mt-3">
            <StaffForm personId={personId} positionTypes={positionTypes} units={units} />
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="text-xl font-bold text-primary">รายการ จศป. ของบุคคลนี้</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-muted-foreground">ยังไม่มีรายการ จศป.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3" data-testid="education-items">
            {items.map((item) => (
              <StaffCard
                key={item.id}
                item={item}
                positionTypes={positionTypes}
                units={units}
                canEdit={editableUnitIds.includes(item.org_unit_id)}
                currentUserId={currentUserId}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StaffForm({
  personId,
  item,
  positionTypes,
  units,
  onDone,
}: {
  personId: string;
  item?: EducationStaff;
  positionTypes: EducationPositionType[];
  units: AccessibleOrgUnit[];
  onDone?: () => void;
}) {
  const { state, onSubmit, pending } = useServerForm(async (prev, formData) => {
    const result = await saveEducationStaff(prev, formData);
    if (result?.message) onDone?.();
    return result;
  });
  const [track, setTrack] = useState<Track | "">(item?.track ?? "");
  const [status, setStatus] = useState<string>(item?.status ?? "active");
  const p = item ? `e${item.id}-` : "new-";
  const options = positionTypes.filter(
    (t) => t.track === track && (t.is_active || t.id === item?.position_type_id),
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="person_id" value={personId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${p}track`}>
            แท่ง<span className="text-destructive"> *</span>
          </Label>
          {item ? <input type="hidden" name="track" value={item.track} /> : null}
          <select
            id={`${p}track`}
            name={item ? undefined : "track"}
            className={selectClass}
            value={track}
            disabled={!!item}
            onChange={(e) => setTrack(e.target.value as Track | "")}
          >
            <option value="">-- เลือกแท่ง --</option>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                {TRACK_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${p}position_type_id`}>
            ประเภทตำแหน่ง<span className="text-destructive"> *</span>
          </Label>
          <select
            id={`${p}position_type_id`}
            name="position_type_id"
            className={selectClass}
            defaultValue={item?.position_type_id ?? ""}
            key={track}
            disabled={!track}
          >
            <option value="">{track ? "-- เลือกประเภทตำแหน่ง --" : "-- เลือกแท่งก่อน --"}</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {track && options.length === 0 ? (
            <p className="text-sm font-medium text-destructive">
              แท่งนี้ยังไม่มีประเภทตำแหน่ง ให้ผู้ดูแลระบบเพิ่มที่ ผู้ดูแลระบบ &gt; ประเภทตำแหน่ง จศป.
            </p>
          ) : null}
        </div>
        <Field
          label="สำนักเรียน สำนักศาสนศึกษา หรือโรงเรียนที่ปฏิบัติหน้าที่"
          name="school_name"
          id={`${p}school_name`}
          defaultValue={item?.school_name ?? ""}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${p}school_type`}>ประเภทสำนัก</Label>
          <select
            id={`${p}school_type`}
            name="school_type"
            className={selectClass}
            defaultValue={item?.school_type ?? ""}
          >
            <option value="">-- ไม่ระบุ --</option>
            {SCHOOL_TYPES.map((t) => (
              <option key={t} value={t}>
                {SCHOOL_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <p className="mb-2 font-semibold">
          เขตที่รับผิดชอบ<span className="text-destructive"> *</span>
        </p>
        <OrgUnitPicker units={units} name="org_unit_id" defaultValue={item?.org_unit_id ?? null} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ThaiDateInput label="วันที่เริ่ม" name="started_on" defaultValue={item?.started_on} />
        <Field
          label="เลขที่คำสั่งแต่งตั้ง"
          name="order_no"
          id={`${p}order_no`}
          defaultValue={item?.order_no ?? ""}
          hint="แนบไฟล์ได้หลังบันทึก"
        />
        <Field label="วิชาที่สอน" name="subjects" id={`${p}subjects`} defaultValue={item?.subjects ?? ""} />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${p}status`}>สถานะ</Label>
          <select
            id={`${p}status`}
            name="status"
            className={selectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STAFF_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STAFF_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {status === "ended" ? (
          <ThaiDateInput label="วันที่พ้นหน้าที่" name="ended_on" defaultValue={item?.ended_on} />
        ) : null}
        <Field label="หมายเหตุ" name="note" id={`${p}note`} defaultValue={item?.note ?? ""} />
      </div>
      <FormMessages state={state} />
      <div>
        <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
          {item ? "บันทึกการแก้ไข" : "บันทึก จศป."}
        </SubmitButton>
      </div>
    </form>
  );
}

function StaffCard({
  item,
  positionTypes,
  units,
  canEdit,
  currentUserId,
}: {
  item: EducationStaff;
  positionTypes: EducationPositionType[];
  units: AccessibleOrgUnit[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const badge = !item.is_active
    ? { text: "ยกเลิก (บันทึกผิด)", className: "bg-muted text-muted-foreground" }
    : item.status === "active"
      ? { text: STAFF_STATUS_LABEL.active, className: "bg-primary text-primary-foreground" }
      : { text: STAFF_STATUS_LABEL[item.status], className: "bg-secondary text-primary" };

  const cancel = () => {
    if (!window.confirm("ยกเลิกรายการนี้ใช่หรือไม่ (ใช้กับรายการที่บันทึกผิดเท่านั้น ถ้าพ้นหน้าที่จริงให้กด \"แก้ไข\" แล้วเปลี่ยนสถานะ)")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await cancelEducationStaff(item.id, item.person_id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <li className={cn("rounded-xl border bg-card p-4", !item.is_active && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">
            {TRACK_LABEL[item.track]} · {item.position_name}
          </p>
          <p>
            {item.school_name || "(ไม่ระบุสำนัก)"}
            {item.school_type ? ` (${SCHOOL_TYPE_LABEL[item.school_type]})` : ""}
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", badge.className)}>{badge.text}</span>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold">เขตที่รับผิดชอบ: </dt>
          <dd className="inline">{item.org_unit_name}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">วันที่เริ่ม: </dt>
          <dd className="inline">{thaiDate(item.started_on)}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">เลขที่คำสั่งแต่งตั้ง: </dt>
          <dd className="inline">{item.order_no || "-"}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">วิชาที่สอน: </dt>
          <dd className="inline">{item.subjects || "-"}</dd>
        </div>
        {item.ended_on ? (
          <div>
            <dt className="inline font-semibold">วันที่พ้นหน้าที่: </dt>
            <dd className="inline">{thaiDate(item.ended_on)}</dd>
          </div>
        ) : null}
        {item.note ? (
          <div>
            <dt className="inline font-semibold">หมายเหตุ: </dt>
            <dd className="inline">{item.note}</dd>
          </div>
        ) : null}
      </dl>

      <details className="mt-3">
        <summary className="cursor-pointer font-semibold text-primary">ไฟล์คำสั่งแต่งตั้ง</summary>
        <div className="mt-2">
          <Attachments
            entityTable="education_staff"
            entityId={item.id}
            orgUnitId={item.org_unit_id}
            currentUserId={currentUserId}
            canUpload={canEdit && item.is_active}
            canRemoveAny={canEdit}
          />
        </div>
      </details>

      {canEdit && item.is_active ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
            {editing ? "ปิดแบบแก้ไข" : "แก้ไข"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={pending}>
            ยกเลิกรายการที่บันทึกผิด
          </Button>
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
      {editing ? (
        <div className="mt-3 rounded-lg border p-3">
          <StaffForm
            personId={item.person_id}
            item={item}
            positionTypes={positionTypes}
            units={units}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : null}
    </li>
  );
}
