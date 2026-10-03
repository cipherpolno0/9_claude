"use client";

import { useState, useTransition } from "react";

import { ErrorText, Field, FormMessages, SubmitButton, useServerForm, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { removeMfa, startMfaEnroll, verifyMfa, type MfaEnrollState } from "@/lib/auth/actions";

function CodeForm({ factorId, next }: { factorId?: string; next: string }) {
  const { state, onSubmit, pending } = useServerForm(verifyMfa);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="factor_id" value={factorId ?? ""} />
      <input type="hidden" name="next" value={next} />
      <Field
        label="รหัส 6 หลักจากแอป"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        required
        autoFocus
      />
      <FormMessages state={state} />
      <SubmitButton pending={pending} pendingText="กำลังตรวจรหัส...">
        ยืนยัน
      </SubmitButton>
    </form>
  );
}

/** มีการตั้งค่าไว้แล้ว: กรอกรหัสเพื่อยืนยันในรอบล็อกอินนี้ */
export function MfaVerify({ next }: { next: string }) {
  return <CodeForm next={next} />;
}

/** ตั้งค่าครั้งแรก: สแกน QR แล้วกรอกรหัสยืนยัน */
export function MfaEnroll() {
  const [enroll, setEnroll] = useState<MfaEnrollState | null>(null);
  const [pending, startTransition] = useTransition();

  if (enroll?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <ol className="list-decimal space-y-1 pl-6">
          <li>เปิดแอป Authenticator บนมือถือ แล้วเลือกเพิ่มบัญชีด้วยการสแกน QR</li>
          <li>สแกนภาพด้านล่าง (หรือพิมพ์รหัสตั้งค่าด้วยมือ)</li>
          <li>กรอกรหัส 6 หลักที่แอปแสดง</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enroll.qrCode} alt="QR สำหรับตั้งค่าแอป Authenticator" className="mx-auto size-48 rounded-md border bg-white p-2" />
        <p className="text-center text-sm break-all">
          รหัสตั้งค่า: <code data-testid="mfa-secret">{enroll.secret}</code>
        </p>
        <CodeForm factorId={enroll.factorId} next="/account/mfa?done=1" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p>ท่านยังไม่ได้ตั้งค่าการยืนยันตัวตน 2 ขั้น ติดตั้งแอป Authenticator บนมือถือก่อน แล้วกดปุ่มด้านล่าง</p>
      {enroll && !enroll.ok ? <ErrorText>{enroll.error}</ErrorText> : null}
      <Button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setEnroll(await startMfaEnroll()))}
      >
        {pending ? "กำลังเตรียม..." : "เริ่มตั้งค่า"}
      </Button>
    </div>
  );
}

/** ปิดการยืนยัน 2 ขั้น (เฉพาะบทบาทที่ไม่บังคับ) */
export function MfaRemove() {
  const [state, setState] = useState<FormState>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <FormMessages state={state} />
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await removeMfa()))}
      >
        {pending ? "กำลังดำเนินการ..." : "ปิดการยืนยันตัวตน 2 ขั้น"}
      </Button>
    </div>
  );
}
