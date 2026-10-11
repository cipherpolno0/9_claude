import type { Metadata } from "next";
import Link from "next/link";

import { fetchPublicPrivacy } from "@/lib/privacy-server";
import { thaiDate } from "@/lib/thai";

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว",
  description: "การเก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคล และช่องทางขอแก้ไขหรือลบข้อมูล",
};
// หน้าคงที่สร้างใหม่ทุก 5 นาที (และทันทีเมื่อผู้ดูแลระบบแก้)
export const revalidate = 300;

/** นโยบายความเป็นส่วนตัว (บทที่ 31): หัวข้อตั้งต้นตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล เนื้อความผู้ดูแลระบบกรอกเอง */
export default async function PrivacyPage() {
  const privacy = await fetchPublicPrivacy().catch(() => null);
  const policy = privacy?.policy ?? [];
  const notices = Object.values(privacy?.notices ?? {}).filter((n) => n && n.body);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">นโยบายความเป็นส่วนตัว</h1>
      {privacy?.updated_at ? <p className="mt-1 text-muted-foreground">ปรับปรุงล่าสุด {thaiDate(privacy.updated_at)}</p> : null}

      <ol className="mt-6 flex flex-col gap-4" data-testid="privacy-sections">
        {policy.map((s, i) => (
          <li key={s.key} className="rounded-xl border bg-card p-5" data-testid="privacy-section">
            <h2 className="text-lg font-bold text-primary">
              {i + 1}. {s.title}
            </h2>
            {s.body ? (
              <p className="mt-2 whitespace-pre-line">{s.body}</p>
            ) : (
              <p className="mt-2 text-muted-foreground">ยังไม่ได้ระบุ</p>
            )}
          </li>
        ))}
      </ol>

      {notices.length ? (
        <div className="mt-6 rounded-xl border bg-card p-5" data-testid="privacy-notices">
          <h2 className="text-lg font-bold text-primary">วัตถุประสงค์ของแบบฟอร์มแต่ละชนิด</h2>
          <dl className="mt-2 flex flex-col gap-3">
            {notices.map((n) => (
              <div key={n!.title}>
                <dt className="font-semibold">{n!.title}</dt>
                <dd className="whitespace-pre-line">{n!.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border-2 border-primary/30 bg-secondary p-5" data-testid="privacy-request">
        <h2 className="text-lg font-bold text-primary">ขอแก้ไขหรือลบข้อมูลส่วนบุคคล</h2>
        <p className="mt-1">
          ส่งคำขอได้ที่{" "}
          <Link href="/contact?topic=privacy" prefetch={false} className="font-semibold text-primary underline underline-offset-4">
            ติดต่อเรา หัวข้อ ข้อมูลส่วนบุคคล
          </Link>{" "}
          โดยระบุข้อมูลที่ต้องการแก้ไขหรือลบ และช่องทางติดต่อกลับ ไม่ต้องส่งเลขประจำตัวประชาชนมาในข้อความ
        </p>
        <p className="mt-1">
          ผู้มีบัญชีที่ผูกกับทะเบียนบุคคล ยื่นคำขอแก้ไขประวัติของตนเองได้ที่ พื้นที่ทำงาน &gt; ประวัติของฉัน
        </p>
      </div>
    </section>
  );
}
