import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ClipboardList, GraduationCap, Landmark, School, Users, type LucideIcon } from "lucide-react";

import { REGISTRY_BASE, REGISTRY_KINDS, type RegistrySlug } from "@/lib/registry";
import { findPublicMenu } from "@/lib/site";

const menu = findPublicMenu("/registry");

export const metadata: Metadata = { title: menu.title };

const ICONS: Record<RegistrySlug, LucideIcon> = {
  "samnak-rian": GraduationCap,
  "samnak-sasanasuksa": GraduationCap,
  temples: Landmark,
  schools: School,
  organizations: Building2,
  venues: ClipboardList,
};

/** หน้านี้เป็นหน้าคงที่ (ไม่อ่านฐานข้อมูล) เพราะทุกหน้าสาธารณะโหลดล่วงหน้าจากเมนู ทะเบียน */
export default function RegistryPage() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-2 text-muted-foreground">{menu.description}</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2" data-testid="registry-kinds">
        {REGISTRY_KINDS.map((k) => {
          const Icon = ICONS[k.slug];
          return (
            <li key={k.slug}>
              <Link
                href={`${REGISTRY_BASE}/${k.slug}`}
                prefetch={false}
                className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary"
              >
                <Icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block text-lg font-semibold text-primary">{k.title}</span>
                  <span className="block text-muted-foreground">{k.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/directory/officers"
            prefetch={false}
            className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary"
          >
            <Users className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-lg font-semibold text-primary">ทำเนียบผู้ดำรงตำแหน่ง</span>
              <span className="block text-muted-foreground">
                รายชื่อเจ้าคณะ รองเจ้าคณะ และเลขานุการ ตามเขตปกครอง
              </span>
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
