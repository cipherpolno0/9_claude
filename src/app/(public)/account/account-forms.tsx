"use client";

import { Field, FormMessages, SubmitButton, useServerForm } from "@/components/form";
import { requestReactivation, updateMyProfile } from "@/lib/auth/actions";
import type { Profile } from "@/lib/auth/session";

export function ProfileForm({ profile }: { profile: Profile }) {
  const { state, onSubmit, pending } = useServerForm(updateMyProfile);
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label="คำนำหน้า" name="title_prefix" defaultValue={profile.title_prefix} />
      <Field label="ชื่อ" name="first_name" defaultValue={profile.first_name} required />
      <Field label="ฉายา" name="monastic_name" defaultValue={profile.monastic_name} />
      <Field label="นามสกุล" name="last_name" defaultValue={profile.last_name} />
      <Field label="เบอร์ติดต่อ" name="phone" type="tel" defaultValue={profile.phone} />
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessages state={state} />
        <SubmitButton pending={pending} className="w-fit" pendingText="กำลังบันทึก...">
          บันทึกข้อมูล
        </SubmitButton>
      </div>
    </form>
  );
}

export function ReactivationForm() {
  const { state, onSubmit, pending } = useServerForm(requestReactivation);
  if (state?.message) return <FormMessages state={state} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="เหตุผลที่ขอเปิดใช้บัญชี" name="note" hint="ผู้ดูแลระบบหรือหน่วยเหนือจะเป็นผู้พิจารณา" />
      <FormMessages state={state} />
      <SubmitButton pending={pending} className="w-fit" pendingText="กำลังส่ง...">
        ขอเปิดใช้บัญชี
      </SubmitButton>
    </form>
  );
}
