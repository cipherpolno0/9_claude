import type { Metadata } from "next";
import Link from "next/link";
import { Award, BarChart3, ListChecks, MapPinned, UserSearch } from "lucide-react";

import { findPublicMenu } from "@/lib/site";

const menu = findPublicMenu("/pali");

export const metadata: Metadata = { title: menu.title };

const LINKS = [
  { href: "/pali/check", icon: UserSearch, text: "ค้นด้วยชื่อ ฉายาหรือนามสกุล ว่าสำนักเรียนส่งรายชื่อเข้าสอบชั้นใด สนามสอบใด" },
  { href: "/pali/results", icon: Award, text: "รายชื่อผู้สอบได้ประโยคบาลีและบาลีศึกษา ค้นด้วยชื่อ วัด สำนักเรียน หรือดูรวมรายปี" },
  { href: "/pali/stats", icon: BarChart3, text: "จำนวนผู้สมัครสอบและผลสอบ แยกปี ครั้งที่ ชั้น ภาค และจังหวัด" },
  { href: "/pali/venues", icon: MapPinned, text: "สนามสอบบาลีส่วนกลาง ส่วนภูมิภาค และต่างประเทศ พร้อมชั้นที่เปิดสอบ" },
  { href: "/pali/apply", icon: ListChecks, text: "ขั้นตอนการส่งรายชื่อผู้ขอเข้าสอบ แบบบัญชี ศ. และคุณสมบัติผู้สมัคร" },
] as const;

/** หน้านี้เป็นหน้าคงที่ (ไม่อ่านฐานข้อมูล) เพราะทุกหน้าสาธารณะโหลดล่วงหน้าจากเมนู */
export default function PaliPage() {
  const titles = new Map((menu.children ?? []).map((c) => [c.href, c.title]));
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-2 text-muted-foreground">{menu.description}</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2" data-testid="pali-menu">
        {LINKS.map(({ href, icon: Icon, text }) => (
          <li key={href}>
            <Link href={href} prefetch={false} className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary">
              <Icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-lg font-semibold text-primary">{titles.get(href)}</span>
                <span className="block text-muted-foreground">{text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
