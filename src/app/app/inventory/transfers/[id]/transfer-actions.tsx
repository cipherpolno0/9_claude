"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayIso } from "@/lib/inventory";

import { cancelTransfer, receiveTransfer } from "../../actions";

export function ReceiveTransferForm({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="receive-transfer-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const f = new FormData(e.currentTarget);
        if (f.get("received_on_incomplete")) return setError("กรุณากรอกวันที่รับให้ครบ");
        startTransition(async () => {
          const r = await receiveTransfer(id, String(f.get("received_on") ?? ""));
          if (r.ok) {
            setFlash(r.message ?? null);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <ThaiDateInput label="วันที่รับ" name="received_on" defaultValue={todayIso()} required className="sm:max-w-md" />
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "รับเข้าคลัง"}
        </Button>
      </div>
    </form>
  );
}

export function CancelTransferForm({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="cancel-transfer-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await cancelTransfer(id, reason);
          if (r.ok) router.refresh();
          else setError(r.error);
        });
      }}
    >
      <div className="flex flex-col gap-1 sm:max-w-md">
        <Label htmlFor="cancel-reason">เหตุผลที่ยกเลิก</Label>
        <Input id="cancel-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <ErrorText>{error}</ErrorText>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "กำลังยกเลิก..." : "ยกเลิกใบโอน (ของคืนคลังต้นทาง)"}
        </Button>
      </div>
    </form>
  );
}
