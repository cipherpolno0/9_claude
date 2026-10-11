import type { Metadata } from "next";
import Link from "next/link";
import { Pin } from "lucide-react";

import { requireSiteContentManager } from "@/lib/auth/guards";
import { announcementState, fileKindLabel, fileSizeText, siteFileUrl } from "@/lib/site-content";
import { fetchAdminAnnouncements } from "@/lib/site-content-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { ActiveToggle, AnnouncementForm } from "../site-forms";

export const metadata: Metadata = { title: "ข่าวประกาศ" };
export const dynamic = "force-dynamic";

const STATE_CLASS = {
  live: "border-emerald-300 bg-emerald-50 text-emerald-900",
  scheduled: "border-sky-300 bg-sky-50 text-sky-900",
  expired: "border-amber-300 bg-amber-50 text-amber-900",
  inactive: "border-input bg-muted text-muted-foreground",
} as const;

/** ข่าวประกาศบนหน้าแรก (ผู้ดูแลระบบและส่วนกลาง) */
export default async function AnnouncementsAdminPage() {
  await requireSiteContentManager();
  const items = await fetchAdminAnnouncements();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/admin" className="text-primary underline underline-offset-4">
          ← ผู้ดูแลระบบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ข่าวประกาศ</h1>
      <p className="mt-1 text-muted-foreground">
        ข่าวแสดงบน{" "}
        <Link href="/" className="text-primary underline underline-offset-4" target="_blank">
          หน้าแรก
        </Link>{" "}
        เมื่อเปิดใช้งาน ถึงวันเผยแพร่ และยังไม่หมดอายุ ข่าวปักหมุดขึ้นก่อน (หน้าแรกปรับภายในไม่กี่วินาทีหลังบันทึก)
      </p>

      <section className="mt-6 rounded-xl border bg-card p-5" data-testid="open-new-announcement">
        <h2 className="text-lg font-bold text-primary">เพิ่มข่าว</h2>
        <div className="mt-4">
          <AnnouncementForm />
        </div>
      </section>

      <ul className="mt-6 flex flex-col gap-3" data-testid="announcement-list">
        {items.map((a) => {
          const st = announcementState(a, today);
          const files = a.files ?? [];
          return (
            <li key={a.id} className="rounded-xl border bg-card p-4" data-testid="announcement-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn("rounded-full border px-2 py-0.5 font-semibold", STATE_CLASS[st.key])} data-testid="announcement-state">
                      {st.label}
                    </span>
                    {a.is_pinned ? (
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <Pin className="size-3.5" aria-hidden />
                        ปักหมุด
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">
                      เผยแพร่ {thaiDate(a.published_on, "short")}
                      {a.expires_on ? ` · หมดอายุ ${thaiDate(a.expires_on, "short")}` : ""} · แก้ไข {thaiDateTime(a.updated_at)}
                    </span>
                  </p>
                  <p className="mt-1 text-lg font-semibold">{a.title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {st.key === "live" ? (
                    <Link href={`/news/${a.id}`} target="_blank" className="self-center text-primary underline underline-offset-4">
                      ดูบนเว็บ
                    </Link>
                  ) : null}
                  <ActiveToggle kind="announcement" id={a.id} active={a.is_active} />
                </div>
              </div>
              {files.length ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {files.map((f) => (
                    <li key={f.id} className={cn("flex flex-wrap items-center gap-2", !f.is_active && "text-muted-foreground line-through")}>
                      <a href={siteFileUrl(f.storage_path)} target="_blank" rel="noopener" className="text-primary underline underline-offset-4">
                        {f.file_name}
                      </a>
                      <span className="text-sm text-muted-foreground">
                        {fileKindLabel(f.mime_type)} {fileSizeText(f.size_bytes)}
                      </span>
                      <ActiveToggle kind="announcement_file" id={f.id} active={f.is_active} label={f.is_active ? "นำไฟล์ออก" : "นำกลับมา"} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <details className="mt-3">
                <summary className="cursor-pointer font-semibold text-primary">แก้ไข / แนบไฟล์เพิ่ม</summary>
                <div className="mt-3">
                  <AnnouncementForm item={a} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {items.length === 0 ? <p className="mt-4 text-muted-foreground">ยังไม่มีข่าว</p> : null}
    </section>
  );
}
