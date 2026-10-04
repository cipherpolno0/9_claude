"use client";

import { Field, FormMessages, SubmitButton, useServerForm } from "@/components/form";

import { linkPersonUser } from "../actions";

/** ผูกบัญชีผู้ใช้กับบุคคล เพื่อให้เจ้าของประวัติเปิดหน้า "ประวัติของฉัน" และยื่นคำขอแก้ไขข้อมูลได้ */
export function LinkAccount({ personId, linked, linkedLabel }: { personId: string; linked: boolean; linkedLabel: string }) {
  const { state, onSubmit, pending } = useServerForm(linkPersonUser);

  return (
    <div className="rounded-xl border bg-card p-5" data-testid="link-account">
      <h2 className="text-xl font-bold text-primary">บัญชีผู้ใช้ของบุคคลนี้</h2>
      <p className="text-muted-foreground">
        {linked
          ? `ผูกกับบัญชี: ${linkedLabel} เจ้าของบัญชีดูประวัติของตนและยื่นขอแก้ไขข้อมูลได้ที่หน้า ประวัติของฉัน`
          : "ยังไม่ได้ผูกบัญชี ถ้าบุคคลนี้มีบัญชีผู้ใช้ในระบบ ให้กรอกอีเมลของบัญชีนั้น"}
      </p>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3" noValidate>
        <input type="hidden" name="person_id" value={personId} />
        {linked ? (
          <input type="hidden" name="email" value="" />
        ) : (
          <Field label="อีเมลของบัญชีผู้ใช้" name="email" type="email" autoComplete="off" className="sm:max-w-md" />
        )}
        <FormMessages state={state} />
        <div>
          <SubmitButton pending={pending} variant={linked ? "outline" : "default"}>
            {linked ? "เลิกผูกบัญชี" : "ผูกบัญชี"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
