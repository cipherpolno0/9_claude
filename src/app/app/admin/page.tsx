import type { Metadata } from "next";
import Link from "next/link";

import { adminMenu } from "@/lib/site";

export const metadata: Metadata = { title: "ผู้ดูแลระบบ" };

export default function AdminPage() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ผู้ดูแลระบบ</h1>
      <p className="mt-1 text-muted-foreground">ตั้งค่าข้อมูลกลางของทั้งเว็บ</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {adminMenu.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary"
              >
                {Icon ? <Icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden /> : null}
                <span>
                  <span className="block text-lg font-semibold text-primary">{item.title}</span>
                  <span className="block text-muted-foreground">{item.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
