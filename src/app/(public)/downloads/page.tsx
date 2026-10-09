import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";

import { EXAM_TYPE_LABEL, EXAM_TYPES, examName } from "@/lib/exam-forms";
import { fetchPublicForms } from "@/lib/exam-forms-server";
import { findPublicMenu } from "@/lib/site";

const menu = findPublicMenu("/downloads");

export const metadata: Metadata = { title: menu.title, description: menu.description };
// หน้านี้ถูกโหลดล่วงหน้าจากเมนูสาธารณะ จึงเป็นหน้าคงที่ที่สร้างใหม่เป็นระยะ (ข้อมูลแบบฟอร์มแคช 5 นาที ล้างทันทีเมื่อผู้ดูแลระบบแก้)
export const revalidate = 300;

export default async function DownloadsPage() {
  const { templates } = await fetchPublicForms().catch(() => ({ templates: [] }));

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-1 text-muted-foreground">{menu.description}</p>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">แม่แบบ Excel บัญชีสำมะโนครัวผู้ขอเข้าสอบ (บัญชี ศ.)</h2>
        <p className="mt-1 text-muted-foreground">
          แม่แบบเปล่าตามแบบของสำนักงานแม่กองธรรม หนึ่งแฟ้มต่อหนึ่งสนามสอบและหนึ่งชั้น ห้ามรวมชั้น ห้ามรวมสนามสอบ
          เจ้าหน้าที่ที่มีบัญชีในระบบ ดาวน์โหลดแม่แบบที่เติมปี รหัสสนามสอบ และชื่อสนามสอบไว้แล้วได้ที่ พื้นที่ทำงาน &gt; สมัครสอบและผลสอบ
        </p>
        <p className="mt-2">
          <Link href="/downloads/guide" prefetch={false} className="font-semibold text-primary underline underline-offset-4">
            อ่านคู่มือการกรอกบัญชี ศ.
          </Link>
        </p>
        {templates.length === 0 ? (
          <p className="mt-4 text-muted-foreground">ยังไม่มีแม่แบบให้ดาวน์โหลด</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {EXAM_TYPES.map((type) => {
              const list = templates.filter((t) => t.exam_type === type);
              if (list.length === 0) return null;
              return (
                <div key={type}>
                  <h3 className="text-lg font-bold">{EXAM_TYPE_LABEL[type]}</h3>
                  <ul className="mt-2 flex flex-col gap-2" data-testid={`downloads-${type}`}>
                    {list.map((t) => (
                      <li key={t.id}>
                        <a
                          href={`/downloads/templates/${t.id}`}
                          className="flex items-center gap-3 rounded-lg border p-3 hover:bg-secondary"
                          data-testid="template-download"
                        >
                          <FileSpreadsheet className="size-6 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold">
                              {t.code} {examName(t.exam_type, t.level)}
                            </span>
                            <span className="block text-sm text-muted-foreground">
                              แฟ้ม Excel (.xlsx) · {t.columns.length} คอลัมน์ · รุ่น {t.version || "-"}
                            </span>
                          </span>
                          <Download className="size-5 shrink-0" aria-hidden />
                          <span className="sr-only">ดาวน์โหลด</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
