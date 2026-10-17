import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Download, ExternalLink, FileSpreadsheet, FileText } from "lucide-react";

import { EXAM_TYPE_LABEL, EXAM_TYPES, examName } from "@/lib/exam-forms";
import { fetchPublicForms } from "@/lib/exam-forms-server";
import { DOWNLOAD_CATEGORIES, DOWNLOAD_CATEGORY_LABEL, fileKindLabel, fileSizeText, siteFileUrl, type DownloadItem } from "@/lib/site-content";
import { fetchPublicDownloads } from "@/lib/site-content-server";
import { USER_MANUALS } from "@/lib/manuals";
import { findPublicMenu } from "@/lib/site";
import { thaiDate } from "@/lib/thai";

const menu = findPublicMenu("/downloads");

export const metadata: Metadata = { title: menu.title, description: menu.description };
// หน้านี้ถูกโหลดล่วงหน้าจากเมนูสาธารณะ จึงเป็นหน้าคงที่ที่สร้างใหม่เป็นระยะ (ข้อมูลแคช 5 นาที ล้างทันทีเมื่อผู้จัดการเนื้อหาแก้)
export const revalidate = 300;

function ItemLink({ d }: { d: DownloadItem }) {
  const external = !d.storage_path;
  const href = d.storage_path ? siteFileUrl(d.storage_path) : (d.url ?? "#");
  return (
    <a
      href={href}
      target="_blank"
      rel={external ? "noopener noreferrer" : "noopener"}
      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-secondary"
      data-testid="download-item"
    >
      <FileText className="size-6 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{d.title}</span>
        {d.description ? <span className="block text-sm text-muted-foreground">{d.description}</span> : null}
        <span className="block text-sm text-muted-foreground">
          {external ? "ลิงก์ภายนอก" : `${fileKindLabel(d.mime_type)} ${fileSizeText(d.size_bytes)}`} · ปรับปรุง {thaiDate(d.updated_at, "short")}
        </span>
      </span>
      {external ? <ExternalLink className="size-5 shrink-0" aria-hidden /> : <Download className="size-5 shrink-0" aria-hidden />}
      <span className="sr-only">{external ? "เปิดลิงก์" : "ดาวน์โหลด"}</span>
    </a>
  );
}

/** ดาวน์โหลด: หน้าเดียวทั้งเว็บ แยก 5 หมวด (แม่แบบบัญชี ศ. สร้างจากแบบฟอร์มในระบบ อยู่ในหมวดแม่แบบ Excel) */
export default async function DownloadsPage() {
  const [{ templates }, items] = await Promise.all([
    fetchPublicForms().catch(() => ({ templates: [] })),
    fetchPublicDownloads().catch((): DownloadItem[] => []),
  ]);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-1 text-muted-foreground">{menu.description}</p>

      <nav aria-label="หมวด" className="mt-6 flex flex-wrap gap-2" data-testid="download-categories">
        {DOWNLOAD_CATEGORIES.map((c) => (
          <a key={c} href={`#${c}`} className="rounded-full border bg-card px-3 py-1 hover:bg-secondary">
            {DOWNLOAD_CATEGORY_LABEL[c]}
          </a>
        ))}
      </nav>

      {DOWNLOAD_CATEGORIES.map((c) => {
        const list = items.filter((d) => d.category === c);
        return (
          <section key={c} id={c} className="mt-6 scroll-mt-24 xl:scroll-mt-36 rounded-xl border bg-card p-5" data-testid={`category-${c}`}>
            <h2 className="text-xl font-bold text-primary">{DOWNLOAD_CATEGORY_LABEL[c]}</h2>

            {c === "template" ? (
              <div className="mt-3">
                <h3 className="text-lg font-bold">แม่แบบ Excel บัญชีสำมะโนครัวผู้ขอเข้าสอบ (บัญชี ศ.)</h3>
                <p className="mt-1 text-muted-foreground">
                  แม่แบบเปล่าตามแบบของสำนักงานแม่กองธรรม หนึ่งแฟ้มต่อหนึ่งสนามสอบและหนึ่งชั้น ห้ามรวมชั้น ห้ามรวมสนามสอบ
                  เจ้าหน้าที่ที่มีบัญชีในระบบ ดาวน์โหลดแม่แบบที่เติมปี รหัสสนามสอบ และชื่อสนามสอบไว้แล้วได้ที่ พื้นที่ทำงาน &gt; สมัครสอบและผลสอบ
                </p>
                {templates.length === 0 ? (
                  <p className="mt-3 text-muted-foreground">ยังไม่มีแม่แบบบัญชี ศ. ให้ดาวน์โหลด</p>
                ) : (
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {EXAM_TYPES.map((type) => {
                      const tl = templates.filter((t) => t.exam_type === type);
                      if (tl.length === 0) return null;
                      return (
                        <div key={type}>
                          <h4 className="font-bold">{EXAM_TYPE_LABEL[type]}</h4>
                          <ul className="mt-2 flex flex-col gap-2" data-testid={`downloads-${type}`}>
                            {tl.map((t) => (
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
            ) : null}

            {c === "manual" ? (
              <ul className="mt-3 flex flex-col gap-2" data-testid="user-manuals">
                {USER_MANUALS.map((m) => (
                  <li key={m.file}>
                    <a
                      href={`/manuals/${m.file}`}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-secondary"
                      data-testid="manual-link"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">คู่มือผู้ใช้: {m.role}</span>
                        <span className="block text-sm text-muted-foreground">{m.description} · PDF</span>
                      </span>
                      <Download className="size-5 shrink-0" aria-hidden />
                      <span className="sr-only">ดาวน์โหลด</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {c === "manual" ? (
              <p className="mt-3">
                <Link
                  href="/downloads/guide"
                  prefetch={false}
                  className="inline-flex items-center gap-2 font-semibold text-primary underline underline-offset-4"
                >
                  <BookOpen className="size-5" aria-hidden />
                  คู่มือการกรอกบัญชี ศ. (สร้างจากแบบฟอร์มในระบบ)
                </Link>
              </p>
            ) : null}

            {list.length ? (
              <ul className="mt-3 flex flex-col gap-2" data-testid={`items-${c}`}>
                {list.map((d) => (
                  <li key={d.id}>
                    <ItemLink d={d} />
                  </li>
                ))}
              </ul>
            ) : c !== "template" && c !== "manual" ? (
              <p className="mt-3 text-muted-foreground">ยังไม่มีรายการในหมวดนี้</p>
            ) : null}
          </section>
        );
      })}
    </section>
  );
}
