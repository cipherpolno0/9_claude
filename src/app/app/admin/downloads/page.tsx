import type { Metadata } from "next";
import Link from "next/link";

import { requireSiteContentManager } from "@/lib/auth/guards";
import { DOWNLOAD_CATEGORIES, DOWNLOAD_CATEGORY_LABEL, fileKindLabel, fileSizeText, siteFileUrl } from "@/lib/site-content";
import { fetchAdminDownloads } from "@/lib/site-content-server";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { ActiveToggle, DownloadForm } from "../site-forms";

export const metadata: Metadata = { title: "ดาวน์โหลด" };
export const dynamic = "force-dynamic";

/** รายการหน้าดาวน์โหลด 5 หมวด (ผู้ดูแลระบบและส่วนกลาง) */
export default async function DownloadsAdminPage() {
  await requireSiteContentManager();
  const items = await fetchAdminDownloads();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/admin" className="text-primary underline underline-offset-4">
          ← ผู้ดูแลระบบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ดาวน์โหลด</h1>
      <p className="mt-1 text-muted-foreground">
        รายการบน{" "}
        <Link href="/downloads" className="text-primary underline underline-offset-4" target="_blank">
          หน้าดาวน์โหลด
        </Link>{" "}
        แยกหมวด ไฟล์เปิดได้ทุกคนโดยไม่ต้องล็อกอิน ห้ามแนบไฟล์ที่มีข้อมูลส่วนบุคคล แม่แบบบัญชี ศ. แก้ที่หน้า แบบฟอร์มบัญชี ศ.
      </p>

      <section className="mt-6 rounded-xl border bg-card p-5" data-testid="open-new-download">
        <h2 className="text-lg font-bold text-primary">เพิ่มรายการ</h2>
        <div className="mt-4">
          <DownloadForm />
        </div>
      </section>

      {DOWNLOAD_CATEGORIES.map((c) => {
        const list = items.filter((d) => d.category === c);
        return (
          <section key={c} className="mt-6" data-testid={`admin-category-${c}`}>
            <h2 className="text-xl font-bold text-primary">
              {DOWNLOAD_CATEGORY_LABEL[c]} ({list.filter((d) => d.is_active).length})
            </h2>
            {list.length === 0 ? (
              <p className="mt-2 text-muted-foreground">ยังไม่มีรายการ</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {list.map((d) => (
                  <li key={d.id} className={cn("rounded-xl border bg-card p-4", !d.is_active && "opacity-70")} data-testid="download-row">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {d.title}
                          {!d.is_active ? <span className="ml-2 text-sm text-muted-foreground">(ปิดใช้งาน)</span> : null}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {d.storage_path ? (
                            <a href={siteFileUrl(d.storage_path)} target="_blank" rel="noopener" className="text-primary underline underline-offset-4">
                              {d.file_name}
                            </a>
                          ) : (
                            <a href={d.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
                              {d.url}
                            </a>
                          )}{" "}
                          {d.storage_path ? `${fileKindLabel(d.mime_type)} ${fileSizeText(d.size_bytes)}` : "ลิงก์ภายนอก"} · ลำดับ {d.sort_order} · แก้ไข{" "}
                          {thaiDateTime(d.updated_at)}
                        </p>
                      </div>
                      <ActiveToggle kind="download" id={d.id} active={d.is_active} />
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer font-semibold text-primary">แก้ไข</summary>
                      <div className="mt-3">
                        <DownloadForm item={d} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}
