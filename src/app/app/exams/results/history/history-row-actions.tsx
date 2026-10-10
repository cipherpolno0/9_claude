"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { setHistoryActive } from "../actions";

/** ปิดใช้งานหรือนำกลับมาใช้ (ไม่ลบข้อมูล) */
export function HistoryActiveButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (active && !window.confirm("ปิดใช้งานรายการนี้ใช่หรือไม่ (จะไม่ใช้เป็นหลักฐานคุณสมบัติอีก)")) return;
        startTransition(async () => {
          const r = await setHistoryActive(id, !active);
          if (!r.ok) window.alert(r.error);
          router.refresh();
        });
      }}
    >
      {active ? "ปิดใช้งาน" : "นำกลับมาใช้"}
    </Button>
  );
}
