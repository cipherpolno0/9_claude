import type { Metadata } from "next";
import Link from "next/link";

import { UnderConstruction } from "@/components/under-construction";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default function LoginPage() {
  return (
    <>
      <UnderConstruction
        title="เข้าสู่ระบบ"
        description="สำหรับเจ้าหน้าที่และผู้มีบัญชีผู้ใช้ ระบบล็อกอินจะเปิดใช้ในบทที่ 3"
      />
      <div className="mx-auto -mt-4 w-full max-w-4xl px-4 pb-14 text-center">
        <Button asChild variant="outline" className="h-auto py-2 whitespace-normal">
          <Link href="/app">ดูโครงหน้าพื้นที่ทำงาน (ชั่วคราว ยังไม่ต้องล็อกอิน)</Link>
        </Button>
      </div>
    </>
  );
}
