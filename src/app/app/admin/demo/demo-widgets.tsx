"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { submitRequest } from "@/lib/requests/actions";

import { sendTestNotification } from "./demo-actions";

/** สาธิตตัวเลือกเขตปกครองตามสิทธิ์: แสดงรหัสของหน่วยที่เลือก */
export function PickerDemo({ units }: { units: AccessibleOrgUnit[] }) {
  const [value, setValue] = useState("");
  const chosen = units.find((u) => u.id === value);
  return (
    <div className="flex flex-col gap-3">
      <OrgUnitPicker units={units} name="demo_unit" onChange={setValue} />
      <p data-testid="picker-value">
        หน่วยที่เลือก: <strong>{chosen ? `${chosen.name} (${chosen.code})` : "ยังไม่ได้เลือก"}</strong>
      </p>
    </div>
  );
}

export function NotifyDemo() {
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-fit"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await sendTestNotification();
            setFlash(result.ok ? (result.message ?? null) : null);
            setError(result.ok ? null : result.error);
          })
        }
      >
        ส่งแจ้งเตือนทดสอบถึงตนเอง
      </Button>
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** ฟอร์มยื่นคำขอทดสอบผ่านเครื่องอนุมัติกลาง */
export function RequestDemo({ units }: { units: AccessibleOrgUnit[] }) {
  const router = useRouter();
  const [orgUnitId, setOrgUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFlash(null);
    if (!orgUnitId) {
      setError("กรุณาเลือกหน่วยที่ยื่น (ต้องเป็นหน่วยที่ท่านดูแล)");
      return;
    }
    startTransition(async () => {
      const result = await submitRequest({ typeKey: "test", orgUnitId, title, payload: { detail } });
      if (result.ok) {
        setFlash(result.message);
        setTitle("");
        setDetail("");
        router.refresh();
      } else setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-muted-foreground">หน่วยที่ยื่น (เลือกได้เฉพาะหน่วยที่ท่านดูแล)</p>
      <OrgUnitPicker units={units} name="request_unit" onChange={setOrgUnitId} required />
      <div className="flex flex-col gap-1">
        <Label htmlFor="demo-title">เรื่อง</Label>
        <Input id="demo-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="demo-detail">รายละเอียด</Label>
        <textarea
          id="demo-detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "กำลังยื่น..." : "ยื่นคำขอทดสอบ"}
      </Button>
    </form>
  );
}
