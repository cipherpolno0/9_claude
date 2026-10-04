import type { Metadata } from "next";
import Link from "next/link";
import { Hammer, Users } from "lucide-react";

import { findPublicMenu } from "@/lib/site";

const menu = findPublicMenu("/registry");

export const metadata: Metadata = { title: menu.title };

/** ทะเบียนที่ยังไม่เปิด จะเพิ่มในบทเรียนของระบบนั้น */
const COMING = ["ทะเบียนสำนักเรียนและสำนักศาสนศึกษา", "ทะเบียนวัดและสถานศึกษา", "ทะเบียนสนามสอบ"];

export default function RegistryPage() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-2 text-muted-foreground">{menu.description}</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/directory/officers"
            className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary"
          >
            <Users className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-lg font-semibold text-primary">ทำเนียบผู้ดำรงตำแหน่งปกครอง</span>
              <span className="block text-muted-foreground">
                รายชื่อเจ้าคณะ รองเจ้าคณะ และเลขานุการ ตามเขตปกครอง
              </span>
            </span>
          </Link>
        </li>
        {COMING.map((title) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-xl border-2 border-dashed border-input bg-secondary p-4"
          >
            <Hammer className="mt-1 size-6 shrink-0 text-ring" aria-hidden />
            <span>
              <span className="block text-lg font-semibold text-primary">{title}</span>
              <span className="block text-muted-foreground">อยู่ระหว่างพัฒนา</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
