"use client";

import { useState } from "react";

import { Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NAK_THAM, NAK_THAM_LABEL, PALI_GRADES, PALI_LABEL, type Person } from "@/lib/persons";

import { submitProfileEdit } from "./actions";

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** ฟอร์ม "ขอแก้ไขข้อมูล": แก้ค่าในช่องที่ต้องการ ระบบส่งเฉพาะช่องที่ต่างจากเดิมให้ผู้พิจารณา */
export function ProfileEditForm({ person }: { person: Person }) {
  const [open, setOpen] = useState(false);
  const { state, onSubmit, pending } = useServerForm(submitProfileEdit);
  const monastic = person.person_type === "monastic";

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        ขอแก้ไขข้อมูล
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate data-testid="profile-edit-form">
      <p className="text-muted-foreground">
        แก้เฉพาะช่องที่ต้องการเปลี่ยน ช่องที่ไม่แก้ให้คงไว้ตามเดิม ข้อมูลจะเปลี่ยนเมื่อคำขอได้รับอนุมัติ
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="คำนำหน้าหรือสมณศักดิ์" name="title" defaultValue={person.title} />
        <Field label="ชื่อ" name="first_name" required defaultValue={person.first_name} />
        {monastic ? <Field label="ฉายา" name="monastic_name" defaultValue={person.monastic_name} /> : null}
        <Field label="นามสกุล" name="last_name" defaultValue={person.last_name} />
        <ThaiDateInput label="วันเกิด" name="birth_date" defaultValue={person.birth_date} />
        {monastic ? (
          <ThaiDateInput label="วันอุปสมบท" name="ordination_date" defaultValue={person.ordination_date} />
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor="nak_tham">น.ธ.</Label>
          <select id="nak_tham" name="nak_tham" className={selectClass} defaultValue={person.nak_tham}>
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
          <select id="pali_grade" name="pali_grade" className={selectClass} defaultValue={person.pali_grade}>
            <option value="">-- ไม่ระบุ --</option>
            {PALI_GRADES.map((v) => (
              <option key={v} value={v}>
                {PALI_LABEL[v]}
              </option>
            ))}
          </select>
        </div>
        <Field label="วุฒิสามัญ" name="general_education" defaultValue={person.general_education} />
        <Field label="วัดที่สังกัด" name="temple_name" defaultValue={person.temple_name} />
        <Field label="เบอร์ติดต่อ" name="phone" inputMode="tel" defaultValue={person.phone} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="detail">รายละเอียดเพิ่มเติม หรือเรื่องอื่นที่ขอแก้ไข</Label>
        <textarea id="detail" name="detail" className={textareaClass} />
        <p className="text-sm text-muted-foreground">
          เลขประจำตัวประชาชน เขตปกครอง สถานะ ตำแหน่ง และข้อมูล จศป. แก้ผ่านช่องด้านบนไม่ได้ ให้อธิบายที่นี่
          เลขานุการจะแก้ไขในทะเบียนให้ (ไม่ต้องพิมพ์เลขประจำตัวประชาชนลงในช่องนี้)
        </p>
      </div>
      <FormMessages state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} pendingText="กำลังยื่นคำขอ...">
          ยื่นคำขอแก้ไขประวัติ
        </SubmitButton>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
