"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/ops/report-actions";

/**
 * หน้าแสดงเมื่อเกิดข้อผิดพลาด (บทที่ 32) ใช้ร่วมกันทั้งโซนสาธารณะและพื้นที่ทำงาน
 * แสดงรหัสอ้างอิง (digest) ให้ผู้ใช้แจ้งผู้ดูแลระบบ ซึ่งค้นในหน้า สถานะระบบ ได้
 */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError({ message: error.message, path: window.location.pathname, digest: error.digest }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center" role="alert" data-testid="error-view">
      <h1 className="text-2xl font-bold text-primary">ขออภัย ระบบขัดข้องชั่วคราว</h1>
      <p className="mt-3 text-muted-foreground">
        ระบบบันทึกปัญหานี้ให้ผู้ดูแลระบบแล้ว กรุณาลองใหม่อีกครั้ง ถ้ายังไม่ได้ ติดต่อผู้ดูแลระบบพร้อมรหัสอ้างอิงด้านล่าง
      </p>
      {error.digest ? (
        <p className="mt-2 text-sm">
          รหัสอ้างอิง <code className="rounded bg-muted px-1.5 py-0.5">{error.digest}</code>
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => retry()}>
          ลองใหม่
        </Button>
        <Button asChild variant="outline">
          <Link href="/">กลับหน้าแรก</Link>
        </Button>
      </div>
    </div>
  );
}
