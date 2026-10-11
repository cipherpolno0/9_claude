"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CONTACT_STATUS, CONTACT_STATUS_LABEL, type ContactStatus } from "@/lib/site-content";

import { setMessageStatus } from "./actions";

export function MessageStatusForm({ id, status, note }: { id: string; status: ContactStatus; note: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="message-status-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setFlash(null);
        startTransition(async () => {
          const r = await setMessageStatus(id, String(fd.get("status")), String(fd.get("note") ?? ""));
          if (r.ok) {
            setFlash(r.message ?? "บันทึกแล้ว");
            router.refresh();
          } else setError(r.error ?? "บันทึกไม่สำเร็จ");
        });
      }}
    >
      <label className="flex flex-col gap-1 font-medium">
        สถานะ
        <select name="status" defaultValue={status} className={selectClass}>
          {CONTACT_STATUS.map((s) => (
            <option key={s} value={s}>
              {CONTACT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1">
        <Label htmlFor="message-note">บันทึกของเจ้าหน้าที่ (เห็นเฉพาะผู้รับ)</Label>
        <textarea
          id="message-note"
          name="note"
          maxLength={2000}
          defaultValue={note}
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
      </div>
      <div aria-live="polite">
        <ErrorText>{error}</ErrorText>
        <InfoText>{flash}</InfoText>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          บันทึก
        </Button>
      </div>
    </form>
  );
}
