import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { findWorkspaceMenu } from "@/lib/site";

const menu = findWorkspaceMenu("/app/budget");

export const metadata: Metadata = { title: menu.title };

export default async function BudgetPage() {
  const ctx = await requireMenu(menu.href);

  const cards = [
    {
      href: "/app/budget/plan",
      title: "แผนงบประมาณและการจัดสรร",
      text: "ต้นไม้งบประมาณ แผนงาน > โครงการหรือกิจกรรม > หมวดรายจ่าย พร้อมยอดวงเงิน จัดสรรแล้ว และคงเหลือ ของหน่วยที่เลือก",
    },
    {
      href: "/app/budget/transfers",
      title: "คำขอโอนเปลี่ยนแปลง",
      text: "โอนวงเงินระหว่างหมวดรายจ่ายของหน่วยเจ้าของงบ ต้องผ่านการอนุมัติของเจ้าคณะของหน่วยนั้น",
    },
    ...(ctx.isAdmin
      ? [{ href: "/app/budget/settings", title: "ตั้งค่างบประมาณ", text: "ปีงบประมาณ (เปิด/ปิด) แหล่งเงิน และหมวดรายจ่าย (ผู้ดูแลระบบ)" }]
      : []),
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-1 text-muted-foreground">
        แผนงบประมาณรายปีงบประมาณ (1 ต.ค. ถึง 30 ก.ย.) การจัดสรรจากหน่วยเหนือสู่หน่วยล่างและสำนัก และการโอนเปลี่ยนแปลงระหว่างรายการ
      </p>
      {!ctx.canViewBudget ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3" data-testid="budget-denied">
          บทบาทของท่านยังไม่มีสิทธิ์ดูงบประมาณ (ผู้ดูแลระบบตั้งได้ที่หน้า สิทธิ์ตามบทบาท)
        </p>
      ) : null}
      <ul className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="budget-menu">
        {cards.map((c) => (
          <li key={c.href}>
            <Link href={c.href} prefetch={false} className="block h-full rounded-xl border bg-card p-4 hover:bg-secondary">
              <span className="text-lg font-bold text-primary">{c.title}</span>
              <span className="mt-1 block text-muted-foreground">{c.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
