"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, Field, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { savePrivacyText, saveRetentionRule } from "./actions";

const textareaClass =
  "min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setError(null);
    setFlash(null);
    start(async () => {
      const r = await fn();
      if (r.ok) setFlash(r.message ?? "บันทึกแล้ว");
      else setError(r.error ?? "บันทึกไม่สำเร็จ");
      router.refresh();
    });
  };
  return { error, flash, pending, run };
}

export function PrivacyTextForm({ k, title, body }: { k: string; title: string; body: string }) {
  const { error, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid={`privacy-text-${k}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => savePrivacyText(k, fd));
      }}
    >
      <Field label="หัวข้อ" name="title" id={`pt-${k}-title`} required maxLength={200} defaultValue={title} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`pt-${k}-body`}>เนื้อความ</Label>
        <textarea id={`pt-${k}-body`} name="body" maxLength={20000} defaultValue={body} className={textareaClass} />
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

export function RetentionForm({ k, years, note }: { k: string; years: number | null; note: string }) {
  const { error, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      data-testid={`retention-${k}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveRetentionRule(k, fd));
      }}
    >
      <Field label="เก็บ (ปี)" name="years" id={`rt-${k}-years`} inputMode="numeric" maxLength={3} className="w-28" defaultValue={years ?? ""} hint="ว่าง = ไม่กำหนด" />
      <Field label="หมายเหตุ / อ้างอิงระเบียบ" name="note" id={`rt-${k}-note`} maxLength={500} className="min-w-0 flex-1" defaultValue={note} />
      <Button type="submit" variant="outline" disabled={pending}>
        บันทึก
      </Button>
      <div aria-live="polite" className="w-full">
        <ErrorText>{error}</ErrorText>
        <InfoText>{flash}</InfoText>
      </div>
    </form>
  );
}
