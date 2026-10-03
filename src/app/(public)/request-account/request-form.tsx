"use client";

import { useState } from "react";

import { Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/config";
import { submitAccountRequest } from "@/lib/auth/actions";
import type { OrgUnit } from "@/lib/org-units";

type Role = { key: string; name: string; requires_org_unit: boolean };

export function RequestForm({ units, roles }: { units: OrgUnit[]; roles: Role[] }) {
  const { state, onSubmit, pending } = useServerForm(submitAccountRequest);
  const [roleKey, setRoleKey] = useState("");
  const role = roles.find((r) => r.key === roleKey);

  if (state?.message) {
    return <FormMessages state={state} />;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold text-primary">ข้อมูลผู้ขอ</legend>
        <Field label="คำนำหน้า" name="title_prefix" hint="เช่น พระ พระมหา พระครู นาย นาง" />
        <Field label="ชื่อ" name="first_name" required />
        <Field label="ฉายา" name="monastic_name" hint="เฉพาะพระภิกษุ" />
        <Field label="นามสกุล" name="last_name" />
        <Field label="อีเมล" name="email" type="email" autoComplete="username" required hint="ใช้เป็นชื่อเข้าสู่ระบบ" />
        <Field label="เบอร์ติดต่อ" name="phone" type="tel" required hint="ไม่แสดงในหน้าสาธารณะ" />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold text-primary">ตำแหน่งและสังกัด</legend>
        <Field label="ตำแหน่ง" name="position_text" required hint="เช่น เลขานุการเจ้าคณะตำบล..." />
        <div className="flex flex-col gap-1">
          <Label htmlFor="role_key">
            บทบาทที่ขอใช้ในระบบ<span className="text-destructive"> *</span>
          </Label>
          <select
            id="role_key"
            name="role_key"
            className={selectClass}
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
            required
          >
            <option value="">-- เลือกบทบาท --</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {role?.requires_org_unit ? (
          <div>
            <p className="mb-2 text-muted-foreground">
              สังกัด: เลือกให้ถึงชั้นของหน่วยที่ท่านปฏิบัติงาน เช่น เลขานุการเจ้าคณะอำเภอ เลือกถึงชั้นอำเภอ
            </p>
            <OrgUnitPicker units={units} name="org_unit_id" required />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor="letter">
            หนังสือรับรอง<span className="text-destructive"> *</span>
          </Label>
          <input
            id="letter"
            name="letter"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            required
            className="w-full rounded-md border border-input p-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
          />
          <p className="text-sm text-muted-foreground">ไฟล์ PDF, JPG หรือ PNG ขนาดไม่เกิน 10 MB</p>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold text-primary">ตั้งรหัสผ่าน</legend>
        <Field
          label="รหัสผ่าน"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint={`อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร มีทั้งตัวอักษรอังกฤษและตัวเลข`}
        />
        <Field label="ยืนยันรหัสผ่าน" name="confirm" type="password" autoComplete="new-password" required />
      </fieldset>

      {/* ช่องดักโปรแกรมอัตโนมัติ ซ่อนจากผู้ใช้จริง */}
      <div className="hidden" aria-hidden>
        <label>
          เว็บไซต์
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <FormMessages state={state} />
      <SubmitButton pending={pending} size="lg" pendingText="กำลังส่งคำขอ...">
        ส่งคำขอบัญชีผู้ใช้
      </SubmitButton>
    </form>
  );
}
