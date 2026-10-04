"use client";

import { useState, useTransition } from "react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";

import { setPlaceActive } from "../actions";

/** ปิดหรือเปิดใช้งานสถานที่ (ใช้กับรายการที่บันทึกผิดหรือซ้ำ ไม่ลบข้อมูลจริง) */
export function PlaceActiveButton({ placeId, isActive }: { placeId: string; isActive: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (isActive && !window.confirm("ปิดใช้งานรายการนี้ใช่หรือไม่ (ใช้กับรายการที่บันทึกผิดหรือซ้ำ ข้อมูลไม่ถูกลบ และเปิดใช้งานใหม่ได้ ถ้าสถานที่ยุบหรือระงับ ให้แก้ช่อง สถานะ แทน)")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setPlaceActive(placeId, !isActive);
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
