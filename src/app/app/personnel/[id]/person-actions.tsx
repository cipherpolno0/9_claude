"use client";

import { useState, useTransition } from "react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";

import { setPersonActive } from "../actions";

/** ปิดหรือเปิดใช้งานบุคคล (ใช้กับรายการที่บันทึกผิดหรือซ้ำ ไม่ลบข้อมูลจริง) */
export function PersonActiveButton({ personId, isActive }: { personId: string; isActive: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (isActive && !window.confirm("ปิดใช้งานบุคคลนี้ใช่หรือไม่ (ใช้กับรายการที่บันทึกผิดหรือซ้ำ ข้อมูลไม่ถูกลบ และเปิดใช้งานใหม่ได้)")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setPersonActive(personId, !isActive);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={toggle} disabled={pending}>
        {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
      </Button>
      {error ? (
        <div className="basis-full">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}
    </>
  );
}
