"use client";

import Link from "next/link";
import { useState } from "react";

import { Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import {
  NAK_THAM,
  NAK_THAM_LABEL,
  PALI_GRADES,
  PALI_LABEL,
  PERSON_STATUSES,
  PERSON_STATUS_LABEL,
  PERSON_TYPES,
  PERSON_TYPE_LABEL,
  type Person,
  type PersonType,
} from "@/lib/persons";

import { savePerson } from "./actions";

/** ฟอร์มเพิ่มและแก้ไขบุคคล (person ว่าง = เพิ่มใหม่) */
export function PersonForm({ person, units }: { person?: Person; units: AccessibleOrgUnit[] }) {
  const { state, onSubmit, pending } = useServerForm(savePerson);
  const [type, setType] = useState<PersonType>(person?.person_type ?? "monastic");
  const monastic = type === "monastic";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="id" value={person?.id ?? ""} />

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ชื่อและประเภท</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="person_type">
              ประเภท<span className="text-destructive"> *</span>
            </Label>
            <select
              id="person_type"
              name="person_type"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as PersonType)}
            >
              {PERSON_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PERSON_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="คำนำหน้าหรือสมณศักดิ์"
            name="title"
            defaultValue={person?.title ?? ""}
            hint={monastic ? "เช่น พระ พระมหา พระครู..." : "เช่น นาย นาง นางสาว"}
          />
          <Field label="ชื่อ" name="first_name" required defaultValue={person?.first_name ?? ""} />
          {monastic ? <Field label="ฉายา" name="monastic_name" defaultValue={person?.monastic_name ?? ""} /> : null}
          <Field label="นามสกุล" name="last_name" defaultValue={person?.last_name ?? ""} />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ข้อมูลส่วนบุคคล</h2>
        <p className="text-muted-foreground">ข้อมูลส่วนนี้ไม่แสดงในหน้าสาธารณะ</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <ThaiDateInput label="วันเกิด" name="birth_date" defaultValue={person?.birth_date} />
          {monastic ? (
            <ThaiDateInput
              label="วันอุปสมบท"
              name="ordination_date"
              defaultValue={person?.ordination_date}
              hint="ระบบใช้คำนวณพรรษา"
            />
          ) : null}
          <div className="flex flex-col gap-1">
            <Field
              label="เลขประจำตัวประชาชน"
              name="national_id"
              inputMode="numeric"
              autoComplete="off"
              maxLength={17}
              placeholder={person?.national_id_last4 ? `บันทึกไว้แล้ว ลงท้ายด้วย ${person.national_id_last4}` : "ตัวเลข 13 หลัก"}
              hint={
                person?.national_id_last4
                  ? "เว้นว่างไว้ถ้าไม่เปลี่ยน ระบบเก็บแบบเข้ารหัสและแสดงเฉพาะ 4 ตัวท้าย"
                  : "เว้นว่างได้ ระบบเก็บแบบเข้ารหัสและแสดงเฉพาะ 4 ตัวท้าย"
              }
            />
            {person?.national_id_last4 ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="clear_national_id" className="size-5 accent-[var(--primary)]" />
                ลบเลขประจำตัวประชาชนที่บันทึกไว้
              </label>
            ) : null}
          </div>
          <Field label="เบอร์ติดต่อ" name="phone" inputMode="tel" defaultValue={person?.phone ?? ""} />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">วิทยฐานะ</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="nak_tham">น.ธ.</Label>
            <select id="nak_tham" name="nak_tham" className={selectClass} defaultValue={person?.nak_tham ?? ""}>
              <option value="">-- ไม่ระบุ --</option>
              {NAK_THAM.map((v) => (
                <option key={v} value={v}>
                  {NAK_THAM_LABEL[v]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pali_grade">ป.ธ.</Label>
            <select id="pali_grade" name="pali_grade" className={selectClass} defaultValue={person?.pali_grade ?? ""}>
              <option value="">-- ไม่ระบุ --</option>
              {PALI_GRADES.map((v) => (
                <option key={v} value={v}>
                  {PALI_LABEL[v]}
                </option>
              ))}
            </select>
          </div>
          <Field label="วุฒิสามัญ" name="general_education" defaultValue={person?.general_education ?? ""} />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">วัดที่สังกัดและสถานะ</h2>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="วัดที่สังกัด" name="temple_name" defaultValue={person?.temple_name ?? ""} />
          <div>
            <p className="mb-2 font-semibold">
              เขตปกครองที่วัดตั้งอยู่<span className="text-destructive"> *</span>
            </p>
            <OrgUnitPicker units={units} name="org_unit_id" defaultValue={person?.org_unit_id ?? null} required />
            <p className="mt-1 text-sm text-muted-foreground">
              เลือกให้ถึงตำบลถ้าทราบ เขตนี้กำหนดว่าใครมองเห็นและแก้ไขบุคคลนี้ได้
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="status">สถานะปัจจุบัน</Label>
              <select id="status" name="status" className={selectClass} defaultValue={person?.status ?? "active"}>
                {PERSON_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PERSON_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <Field label="หมายเหตุ" name="note" defaultValue={person?.note ?? ""} />
          </div>
        </div>
      </div>

      <FormMessages state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
          {person ? "บันทึกการแก้ไข" : "บันทึกบุคคล"}
        </SubmitButton>
        <Button asChild variant="outline">
          <Link href={person ? `/app/personnel/${person.id}` : "/app/personnel"}>ยกเลิก</Link>
        </Button>
      </div>
    </form>
  );
}
