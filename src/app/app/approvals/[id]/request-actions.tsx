"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelRequest, decideRequest, resubmitRequest } from "@/lib/requests/actions";
import { DECISION_LABEL, type Decision } from "@/lib/requests/labels";

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** ฟอร์มของผู้พิจารณา: เห็นชอบ / ไม่เห็นชอบ / ส่งกลับแก้ไข */
export function DecisionForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (decision: Decision) => {
    setError(null);
    if (decision !== "approved" && !comment.trim()) {
      setError("กรุณาระบุความเห็นหรือเหตุผล");
      return;
    }
    startTransition(async () => {
      const result = await decideRequest({ requestId, decision, comment });
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-comment">ความเห็น</Label>
        <textarea
          id="decision-comment"
          className={textareaClass}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">ต้องระบุเมื่อไม่เห็นชอบหรือส่งกลับแก้ไข</p>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => decide("approved")}>
          {DECISION_LABEL.approved}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => decide("returned")}>
          {DECISION_LABEL.returned}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => decide("rejected")}>
          {DECISION_LABEL.rejected}
        </Button>
      </div>
    </div>
  );
}

/** ฝั่งผู้ยื่น: แก้ไขแล้วส่งใหม่ (เมื่อถูกส่งกลับ) และยกเลิกคำขอ */
export function RequesterActions({
  requestId,
  status,
  title,
  detail,
}: {
  requestId: string;
  status: "pending" | "returned";
  title: string;
  detail: string;
}) {
  const router = useRouter();
  const [newTitle, setNewTitle] = useState(title);
  const [newDetail, setNewDetail] = useState(detail);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.ok) {
        setFlash(result.message ?? null);
        router.refresh();
      } else setError(result.error);
    });

  return (
    <div className="flex flex-col gap-3">
      {flash ? <InfoText>{flash}</InfoText> : null}
      {status === "returned" ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="resubmit-title">เรื่อง</Label>
            <Input id="resubmit-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="resubmit-detail">รายละเอียด</Label>
            <textarea
              id="resubmit-detail"
              className={textareaClass}
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
            />
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">คำขออยู่ระหว่างรอพิจารณา ท่านยกเลิกได้ก่อนได้ผลขั้นสุดท้าย</p>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        {status === "returned" ? (
          <Button
            disabled={pending}
            onClick={() => run(() => resubmitRequest({ requestId, title: newTitle, payload: { detail: newDetail } }))}
          >
            ส่งคำขอใหม่
          </Button>
        ) : null}
        <Button variant="outline" disabled={pending} onClick={() => run(() => cancelRequest(requestId))}>
          ยกเลิกคำขอ
        </Button>
      </div>
    </div>
  );
}
