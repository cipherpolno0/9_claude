import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

import { PrivacyNotice } from "@/components/privacy-notice";
import { PlaceMap } from "@/components/public/place-map";
import type { SiteContact } from "@/lib/site-content";
import { fetchSiteContact } from "@/lib/site-content-server";
import { findPublicMenu, site } from "@/lib/site";

import { ContactForm } from "./contact-form";

const menu = findPublicMenu("/contact");

export const metadata: Metadata = { title: menu.title, description: menu.description };
// หน้านี้ถูกโหลดล่วงหน้าจากเมนูสาธารณะ จึงเป็นหน้าคงที่ที่สร้างใหม่ทุก 5 นาที (และทันทีเมื่อผู้ดูแลระบบแก้ข้อมูลติดต่อ)
export const revalidate = 300;

const NOT_SET = "ยังไม่ได้ระบุ";

function InfoRow({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b py-3 last:border-b-0">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <div className="break-words whitespace-pre-wrap text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** ติดต่อเรา: หน้าเดียวทั้งเว็บ (ข้อมูลติดต่อผู้ดูแลระบบกรอกเอง) */
export default async function ContactPage() {
  const c: SiteContact | null = await fetchSiteContact().catch(() => null);
  const topics = c?.topics ?? [];
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-1 text-muted-foreground">{menu.description}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border bg-card p-5" data-testid="contact-info">
            <h2 className="text-xl font-bold text-primary">{c?.agency_name || site.shortName}</h2>
            <div className="mt-2">
              <InfoRow icon={MapPin} label="ที่อยู่">
                {c?.address || NOT_SET}
              </InfoRow>
              <InfoRow icon={Phone} label="โทรศัพท์">
                {c?.phone ? (
                  <a href={`tel:${c.phone.split(/[,\s]/)[0]}`} className="text-primary underline underline-offset-4">
                    {c.phone}
                  </a>
                ) : (
                  NOT_SET
                )}
              </InfoRow>
              <InfoRow icon={Mail} label="อีเมล">
                {c?.email ? (
                  <a href={`mailto:${c.email}`} className="text-primary underline underline-offset-4">
                    {c.email}
                  </a>
                ) : (
                  NOT_SET
                )}
              </InfoRow>
              <InfoRow icon={Clock} label="เวลาทำการ">
                {c?.office_hours || NOT_SET}
              </InfoRow>
            </div>
          </section>
          {c?.latitude != null && c?.longitude != null ? (
            <section className="rounded-xl border bg-card p-5" data-testid="contact-map">
              <h2 className="mb-3 text-xl font-bold text-primary">แผนที่</h2>
              <PlaceMap latitude={c.latitude} longitude={c.longitude} name={c.agency_name || site.shortName} />
              {c.map_note ? <p className="mt-2 text-muted-foreground">{c.map_note}</p> : null}
            </section>
          ) : null}
        </div>

        <section className="relative rounded-xl border bg-card p-5" aria-labelledby="form-title">
          <h2 id="form-title" className="text-xl font-bold text-primary">
            ส่งข้อความถึงเจ้าหน้าที่
          </h2>
          <p className="mt-1 mb-4 text-muted-foreground">เลือกหัวข้อให้ตรงกับเรื่อง ข้อความจะส่งถึงเจ้าหน้าที่ผู้รับผิดชอบหัวข้อนั้นโดยตรง</p>
          {topics.length ? <ContactForm topics={topics} /> : <p className="text-muted-foreground">แบบฟอร์มยังไม่พร้อมใช้งาน</p>}
          <PrivacyNotice noticeKey="notice_contact" className="mt-4" />
        </section>
      </div>
    </section>
  );
}
