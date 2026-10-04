"use client";

import { useState, useTransition } from "react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";

import { setVenueActive } from "../actions";

/** ปิดหรือเปิดใช้งานสนามสอบ (ใช้กับรายการที่บันทึกผิดหรือซ้ำ ไม่ลบข้อมูลจริง) */
export function VenueActiveButton({ venueId, isActive }: { venueId: string; isActive: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (
      isActive &&
      !window.confirm(
        "ปิดใช้งานสนามสอบนี้ใช่หรือไม่ (ใช้กับรายการที่บันทึกผิดหรือซ้ำ ข้อมูลไม่ถูกลบ และเปิดใช้งานใหม่ได้ ถ้าสนามสอบเลิกใช้หรือย้าย ให้แก้ช่อง สถานะ แทน)",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setVenueActive(venueId, !isActive);
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
