"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FilePlus2, Send, Undo2, Upload, UserPlus } from "lucide-react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import type { BatchDetail } from "@/lib/exam-batches";

import { cancelSubmission, confirmBatch, submitBatch, uploadRegistration, withdrawBatch, withdrawCandidate } from "../actions";

type Ask = null | "all" | "only_ok" | "withdraw" | "submit" | "cancel";
type Result = { ok: true; message?: string } | { ok: false; error: string };

const n = (v: number) => v.toLocaleString("th-TH");

/** ขั้น ง. ยืนยัน ส่งบัญชี ดึงกลับ อัปโหลดเพิ่ม และถอนบัญชี (ผู้อัปโหลด ส่วนกลาง ผู้ดูแลระบบ) */
export function BatchActions({ batch, maxMb }: { batch: BatchDetail; maxMb: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<Result>) =>
    startTransition(async () => {
      setError(null);
      setDetails([]);
      setMessage(null);
      const result = await fn();
      if (!result.ok) setError(result.error);
      else {
        setMessage(result.message ?? "บันทึกแล้ว");
        setAsk(null);
        setReason("");
      }
      router.refresh();
    });

  const upload = () =>
    startTransition(async () => {
      setError(null);
      setDetails([]);
      setMessage(null);
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("กรุณาเลือกไฟล์ Excel ที่กรอกแล้ว");
        return;
      }
      if (file.size > maxMb * 1024 * 1024) {
        setError(`ไฟล์ใหญ่เกิน ${maxMb} MB`);
        return;
      }
      const formData = new FormData();
      formData.set("batch", batch.id);
      formData.set("file", file);
      const result = await uploadRegistration(formData);
      if (!result.ok) {
        setError(result.error);
        setDetails(result.details ?? []);
      } else {
        setMessage(`เพิ่มไฟล์ที่ ${result.appended ?? ""} เข้าบัญชีแล้ว ตรวจแถวใหม่ด้านล่าง แล้วกดยืนยันรายชื่อ`);
        if (fileRef.current) fileRef.current.value = "";
      }
      router.refresh();
    });

  const mode = batch.edit_mode;
  const open = mode === "open";
  const override = mode === "override";
  const draft = batch.status === "draft";
  const newOk = Math.max(0, batch.ok_count - batch.saved_count);
  const pendingBad = batch.pending_error_count;
  const unlocked = batch.status === "draft" || batch.status === "confirmed" || batch.status === "returned";
  const canSubmit = open && (batch.status === "confirmed" || batch.status === "returned");
  const canCancel =
    batch.status === "submitted" && batch.request?.status === "pending" && batch.request.requester_is_me && batch.round.accepting;
  const canWithdraw = (open && unlocked) || (override && batch.status !== "withdrawn");
  const messages = (
    <div className="mt-3 flex flex-col gap-2">
      <ErrorText>{error}</ErrorText>
      {details.length ? (
        <ul className="list-disc pl-6 text-destructive" data-testid="upload-problems">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
      <InfoText>{message}</InfoText>
    </div>
  );

  if (!mode && !canCancel) {
    return message || error ? messages : null;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="batch-actions">
      {override ? (
        <p className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-amber-950" data-testid="override-note">
          {batch.round.accepting ? "บัญชีนี้ส่งแล้ว" : "ปิดรับสมัครแล้ว"} ท่านแก้ไขได้ในฐานะเจ้าหน้าที่ส่วนกลาง และต้องระบุเหตุผลทุกครั้ง
        </p>
      ) : null}

      {open && draft ? (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-bold">ขั้น ง. ยืนยันรายชื่อ</h2>
          {pendingBad === 0 ? (
            <p className="mt-2">ทุกแถวที่รอยืนยันผ่านการตรวจ กดยืนยันเพื่อบันทึกเป็นผู้สมัครและออกรหัสผู้สมัคร</p>
          ) : (
            <p className="mt-2">
              มี <strong className="text-destructive">{n(pendingBad)} แถวไม่ผ่าน</strong> กด แก้ไข ที่แถวนั้นเพื่อแก้บนหน้าจอ หรือ ถอน
              แถวที่ไม่ต้องการ หรือเลือกบันทึกเฉพาะ {n(newOk)} แถวที่ผ่าน (แถวที่ไม่ผ่านจะเก็บไว้ดูแต่ไม่นับเป็นผู้สมัคร)
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingBad === 0 ? (
              <Button type="button" size="lg" disabled={pending || newOk === 0} onClick={() => setAsk("all")}>
                <CheckCircle2 aria-hidden />
                ยืนยันบันทึกทั้งหมด ({n(newOk)} คน)
              </Button>
            ) : (
              <Button type="button" size="lg" disabled={pending || newOk === 0} onClick={() => setAsk("only_ok")}>
                <CheckCircle2 aria-hidden />
                บันทึกเฉพาะแถวที่ผ่าน ({n(newOk)} คน)
              </Button>
            )}
          </div>
          {ask === "all" || ask === "only_ok" ? (
            <div className="mt-3 rounded-lg border border-primary bg-secondary p-4" role="group" aria-label="ยืนยันการบันทึก">
              <p className="font-medium">
                {ask === "all"
                  ? `บันทึกผู้สมัคร ${n(newOk)} คน และออกรหัสผู้สมัคร ใช่หรือไม่`
                  : `บันทึกเฉพาะ ${n(newOk)} คนที่ผ่าน (ไม่บันทึก ${n(pendingBad)} แถวที่ไม่ผ่าน) ใช่หรือไม่`}
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
        </div>
      ) : null}

      {canSubmit ? (
        <div className="rounded-xl border-2 border-ring bg-card p-5" data-testid="submit-box">
          <h2 className="text-lg font-bold">{batch.status === "returned" ? "แก้ไขแล้วส่งบัญชีอีกครั้ง" : "ส่งบัญชี"}</h2>
          <p className="mt-2">
            {batch.status === "returned" ? (
              <>
                บัญชีถูกส่งกลับให้แก้ไข อ่านความเห็นที่{" "}
                {batch.request ? (
                  <Link href={`/app/approvals/${batch.request.id}`} className="text-primary underline underline-offset-4">
                    เส้นทางรับรอง {batch.request.request_no}
                  </Link>
                ) : null}{" "}
                แก้รายชื่อแล้วส่งอีกครั้ง (เลขที่รับเดิม)
              </>
            ) : (
              <>
                ส่งรายชื่อผู้สมัคร {n(batch.saved_count)} คน ให้เจ้าคณะอำเภอ แล้วเจ้าคณะจังหวัด รับรอง ระบบออกเลขที่รับให้
                เมื่อส่งแล้วรายชื่อจะถูกล็อก แก้ไม่ได้จนกว่าจะดึงกลับหรือถูกส่งกลับ
              </>
            )}
          </p>
          {ask === "submit" ? (
            <div className="mt-3 rounded-lg border border-primary bg-secondary p-4" role="group" aria-label="ยืนยันการส่งบัญชี">
              <p className="font-medium">ส่งบัญชีผู้สมัคร {n(batch.saved_count)} คน ใช่หรือไม่</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" disabled={pending} onClick={() => run(() => submitBatch(batch.id))}>
                  {pending ? "กำลังส่ง..." : "ยืนยันส่งบัญชี"}
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setAsk(null)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" size="lg" className="mt-3" disabled={pending} onClick={() => setAsk("submit")}>
              <Send aria-hidden />
              {batch.status === "returned" ? "ส่งบัญชีอีกครั้ง" : "ส่งบัญชี"}
            </Button>
          )}
        </div>
      ) : null}

      {canCancel ? (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-bold">บัญชีส่งแล้ว รอรับรอง</h2>
          <p className="mt-2">ถ้าต้องแก้รายชื่อก่อนได้รับรอง ดึงบัญชีกลับได้ แล้วส่งใหม่ (จะได้เลขที่รับใหม่)</p>
          {ask === "cancel" ? (
            <div className="mt-3 rounded-lg border border-primary bg-secondary p-4" role="group" aria-label="ยืนยันการดึงบัญชีกลับ">
              <p className="font-medium">ดึงบัญชีกลับ (ยกเลิกการส่ง {batch.request?.request_no}) ใช่หรือไม่</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => cancelSubmission(batch.id, batch.request?.id ?? ""))}
                >
                  {pending ? "กำลังดึงกลับ..." : "ยืนยันดึงบัญชีกลับ"}
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setAsk(null)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" className="mt-3" disabled={pending} onClick={() => setAsk("cancel")}>
              <Undo2 aria-hidden />
              ดึงบัญชีกลับ
            </Button>
          )}
        </div>
      ) : null}

      {mode ? (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-bold">แก้ไขรายชื่อ</h2>
          <p className="mt-1 text-muted-foreground">
            กด แก้ไข หรือ ถอน ที่แถวในตารางด้านล่าง
            {draft || override ? "" : " (บัญชีที่ยืนยันแล้ว รายชื่อที่เพิ่มหรือแก้ต้องผ่านการตรวจทุกข้อจึงบันทึกได้)"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!(draft && override) ? (
              <Button asChild variant="outline">
                <Link href={`/app/exams/batches/${batch.id}/candidates/new`} prefetch={false}>
                  <UserPlus aria-hidden />
                  เพิ่มรายชื่อทีละคน
                </Link>
              </Button>
            ) : null}
          </div>
          {open && unlocked ? (
            <div className="mt-4 border-t pt-4">
              <label htmlFor="append-file" className="flex items-center gap-2 font-medium">
                <FilePlus2 className="size-5" aria-hidden />
                อัปโหลดไฟล์เพิ่มเติม (.xlsx แบบเดียวกัน สำนักและสนามสอบเดียวกัน)
              </label>
              <input
                id="append-file"
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="mt-1 block w-full rounded-md border bg-background p-2"
              />
              <Button type="button" variant="outline" className="mt-2" disabled={pending} onClick={upload}>
                <Upload aria-hidden />
                {pending ? "กำลังอ่านและตรวจไฟล์..." : "อัปโหลดเพิ่มเติม"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {canWithdraw ? (
        <div className="rounded-xl border bg-card p-5">
          {ask === "withdraw" ? (
            <div className="rounded-lg border border-destructive/50 p-4" role="group" aria-label="ถอนบัญชี">
              <label htmlFor="withdraw-reason" className="font-medium">
                เหตุผลที่ถอน{override ? " (ต้องระบุ)" : " (ไม่บังคับ)"}
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
                ถอนแล้วผู้สมัครทั้งบัญชีไม่นับเป็นผู้สมัคร รหัสผู้สมัครที่ออกแล้วไม่นำกลับมาใช้
                {batch.request && (batch.status === "submitted" || batch.status === "returned") ? " และการส่งที่รอรับรองจะถูกยกเลิก" : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={pending}
                  onClick={() => run(() => withdrawBatch(batch.id, reason))}
                >
                  {pending ? "กำลังถอน..." : "ยืนยันถอนบัญชีนี้"}
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setAsk(null)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" disabled={pending} onClick={() => setAsk("withdraw")}>
              <Undo2 aria-hidden />
              ถอนบัญชีนี้ทั้งบัญชี
            </Button>
          )}
        </div>
      ) : null}

      {messages}
    </div>
  );
}

/** ปุ่มถอนรายชื่อรายแถว (ถามเหตุผลก่อน) */
export function WithdrawRowButton({ batchId, candidateId, name, needReason }: { batchId: string; candidateId: string; name: string; needReason: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = `wr-${candidateId}`;

  if (!asking) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)} aria-label={`ถอน ${name}`}>
        ถอน
      </Button>
    );
  }
  return (
    <div className="flex min-w-56 flex-col gap-1" role="group" aria-label={`ถอนรายชื่อ ${name}`}>
      <label htmlFor={id} className="text-sm font-medium">
        เหตุผลที่ถอน{needReason ? " (ต้องระบุ)" : ""}
      </label>
      <input
        id={id}
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
        className="rounded-md border bg-background px-2 py-1"
      />
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          className="bg-destructive text-white hover:bg-destructive/90"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await withdrawCandidate(batchId, candidateId, reason);
              if (!result.ok) setError(result.error);
              else setAsking(false);
              router.refresh();
            })
          }
        >
          {pending ? "กำลังถอน..." : "ยืนยันถอน"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setAsking(false)}>
          ยกเลิก
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
