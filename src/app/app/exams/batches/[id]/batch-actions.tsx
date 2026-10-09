"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import type { BatchDetail } from "@/lib/exam-batches";

import { confirmBatch, withdrawBatch } from "../actions";

type Ask = null | "all" | "only_ok" | "withdraw";

/** ขั้น ง. ยืนยัน และการถอนชุด (แสดงเฉพาะผู้อัปโหลด ส่วนกลาง และผู้ดูแลระบบ) */
export function BatchActions({ batch }: { batch: BatchDetail }) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const result = await fn();
      if (!result.ok) setError(result.error);
      else {
        setMessage(result.message ?? "บันทึกแล้ว");
        setAsk(null);
      }
      router.refresh();
    });

  const draft = batch.status === "draft";
  const canWithdraw = batch.status === "draft" || batch.status === "confirmed";
  const ok = batch.ok_count.toLocaleString("th-TH");
  const bad = batch.error_count.toLocaleString("th-TH");

  // ชุดที่ถอนแล้ว: แสดงเฉพาะผลการทำรายการล่าสุด (ถ้ามี)
  if (!draft && !canWithdraw) {
    return message || error ? (
      <div className="flex flex-col gap-2">
        <ErrorText>{error}</ErrorText>
        <InfoText>{message}</InfoText>
      </div>
    ) : null;
  }

  return (
    <div className="rounded-xl border bg-card p-5" data-testid="batch-actions">
      {draft ? (
        <>
          <h2 className="text-lg font-bold">ขั้น ง. ยืนยันรายชื่อ</h2>
          {!batch.round.accepting ? (
            <p className="mt-2 text-amber-900">รอบนี้ปิดรับสมัครแล้ว หรือไม่อยู่ในช่วงวันรับสมัคร จึงยืนยันไม่ได้</p>
          ) : batch.error_count === 0 ? (
            <p className="mt-2">ทุกแถวผ่านการตรวจ กดยืนยันเพื่อบันทึกเป็นผู้สมัครและออกรหัสผู้สมัคร</p>
          ) : (
            <p className="mt-2">
              มี <strong className="text-destructive">{bad} แถวไม่ผ่าน</strong> แก้ไฟล์แล้ว{" "}
              <Link href="/app/exams/batches/new" prefetch={false} className="text-primary underline underline-offset-4">
                อัปโหลดใหม่
              </Link>{" "}
              (แล้วถอนชุดนี้) หรือเลือกบันทึกเฉพาะ {ok} แถวที่ผ่าน แถวที่ไม่ผ่านจะเก็บไว้ดูแต่ไม่นับเป็นผู้สมัคร
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {batch.error_count === 0 ? (
              <Button type="button" size="lg" disabled={pending || !batch.round.accepting} onClick={() => setAsk("all")}>
                <CheckCircle2 aria-hidden />
                ยืนยันบันทึกทั้งหมด ({ok} คน)
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                disabled={pending || !batch.round.accepting || batch.ok_count === 0}
                onClick={() => setAsk("only_ok")}
              >
                <CheckCircle2 aria-hidden />
                บันทึกเฉพาะแถวที่ผ่าน ({ok} คน)
              </Button>
            )}
          </div>
        </>
      ) : null}

      {ask === "all" || ask === "only_ok" ? (
        <div className="mt-3 rounded-lg border border-primary bg-secondary p-4" role="group" aria-label="ยืนยันการบันทึก">
          <p className="font-medium">
            {ask === "all"
              ? `บันทึกผู้สมัคร ${ok} คน และออกรหัสผู้สมัคร ใช่หรือไม่`
              : `บันทึกเฉพาะ ${ok} คนที่ผ่าน (ไม่บันทึก ${bad} แถวที่ไม่ผ่าน) ใช่หรือไม่`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => run(() => confirmBatch(batch.id, ask === "only_ok"))}>
              {pending ? "กำลังบันทึก..." : "ยืนยัน"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setAsk(null)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : null}

      {canWithdraw ? (
        <div className={draft ? "mt-5 border-t pt-4" : ""}>
          {ask === "withdraw" ? (
            <div className="rounded-lg border border-destructive/50 p-4" role="group" aria-label="ถอนชุดรายชื่อ">
              <label htmlFor="withdraw-reason" className="font-medium">
                เหตุผลที่ถอน (ไม่บังคับ)
              </label>
              <textarea
                id="withdraw-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-md border bg-background p-2"
              />
              <p className="mt-1 text-sm text-muted-foreground">
                ถอนแล้วผู้สมัครในชุดนี้ไม่นับเป็นผู้สมัคร และรหัสผู้สมัครที่ออกแล้วจะไม่นำกลับมาใช้
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" disabled={pending} onClick={() => run(() => withdrawBatch(batch.id, reason))}>
                  {pending ? "กำลังถอน..." : "ยืนยันถอนชุดนี้"}
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setAsk(null)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" disabled={pending} onClick={() => setAsk("withdraw")}>
              <Undo2 aria-hidden />
              ถอนชุดรายชื่อนี้
            </Button>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        <ErrorText>{error}</ErrorText>
        <InfoText>{message}</InfoText>
      </div>
    </div>
  );
}
