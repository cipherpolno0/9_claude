import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";

import { PersonSearch } from "./person-search";

export const metadata: Metadata = { title: "ตรวจสอบผู้สมัครรายบุคคล" };
export const dynamic = "force-dynamic";

export default async function PersonCheckPage() {
  await requireMenu("/app/exams");
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>{" "}
        /{" "}
        <Link href="/app/exams/lists" className="text-primary underline underline-offset-4">
          ตรวจรายชื่อและพิมพ์บัญชี ศ.
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ตรวจสอบผู้สมัครรายบุคคล</h1>
      <p className="mt-1 text-muted-foreground">
        ค้นด้วยชื่อ ฉายา นามสกุล (คำละอย่างน้อย 2 ตัวอักษร) หรือเลขประจำตัวประชาชน เห็นชั้นที่สมัคร สำนัก สนามสอบ และประวัติการสมัครทุกปี
        เฉพาะบัญชีในเขตที่ท่านมีสิทธิ์เห็น (รวมบัญชีที่ยังไม่ส่ง) เลขประจำตัวแสดงเฉพาะ 4 ตัวท้าย
      </p>
      <PersonSearch />
    </section>
  );
}
