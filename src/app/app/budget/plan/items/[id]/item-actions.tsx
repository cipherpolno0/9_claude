"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { cancelAllocation, setItemActive } from "../../../actions";

/** ปิดใช้งาน / เปิดใช้งานรายการ (soft delete) ต้องระบุเหตุผลเมื่อปิด */
export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      setError(null);
      const r = await setItemActive(id, !active, reason);
      if (r.ok) {
        setFlash(r.message ?? null);
        setOpen(false);
        router.refresh();
      } else setError(r.error);
    });
  if (active && !open) {
    return (
      <div className="flex flex-col gap-2">
        <InfoText>{flash}</InfoText>
        <div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            ปิดใช้งานรายการนี้
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="active-toggle">
      {active ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="deactivate-reason">เหตุผลที่ปิดใช้งาน</Label>
          <Input id="deactivate-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="default" disabled={pending || (active && reason.trim().length < 3)} onClick={run}>
          {active ? "ยืนยันปิดใช้งาน" : "เปิดใช้งานอีกครั้ง"}
        </Button>
        {active ? (
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            ยกเลิก
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** ยกเลิกการจัดสรรครั้งหนึ่ง (ต้องระบุเหตุผล รายการยังอยู่ในประวัติ) */
export function CancelAllocationButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        ยกเลิก
      </Button>
    );
  }
  return (
    <div className="flex min-w-56 flex-col gap-1" data-testid="cancel-allocation">
      <Label htmlFor={`cancel-${id}`} className="text-sm">
        เหตุผลที่ยกเลิก
      </Label>
      <Input id={`cancel-${id}`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await cancelAllocation(id, reason);
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
        >
          ยืนยันยกเลิก
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          ปิด
        </Button>
      </div>
    </div>
  );
}
