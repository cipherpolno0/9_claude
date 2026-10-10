"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";

import { publishResults } from "../actions";

/** ประกาศผลของรอบ: เลือกวันที่ประกาศ (พิมพ์ท้ายบัญชีผู้สอบได้) ยืนยันก่อนกด เพราะย้อนกลับไม่ได้ */
export function PublishForm({ roundId, missing, today }: { roundId: string; missing: number; today: string }) {
  const router = useRouter();
  const [allow, setAllow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
      data-testid="publish-form"
      onSubmit={(e) => {
        e.preventDefault();
        const date = String(new FormData(e.currentTarget).get("announced_on") ?? "");
        if (!date) {
          setError("กรุณาเลือกวันที่ประกาศผลให้ครบ วัน เดือน ปี");
          return;
        }
        if (!window.confirm("ประกาศผลแล้วย้อนกลับไม่ได้ หน้าสาธารณะจะแสดงผู้สอบได้ทันที ยืนยันประกาศผลใช่หรือไม่")) return;
        startTransition(async () => {
          const r = await publishResults(roundId, date, allow);
          if (r.ok) {
            setError(null);
            setFlash(r.message ?? null);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <p className="font-semibold">ประกาศผลสอบของรอบนี้</p>
      <div className="flex flex-wrap items-end gap-3">
        <ThaiDateInput label="วันที่ประกาศผล (พิมพ์ท้ายบัญชีผู้สอบได้)" name="announced_on" defaultValue={today} required className="w-full max-w-md" />
        {missing > 0 ? (
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" className="size-5" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
            ยืนยันประกาศทั้งที่ยังไม่มีผล {missing.toLocaleString("th-TH")} คน
          </label>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังประกาศ..." : "ประกาศผล"}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
    </form>
  );
}
