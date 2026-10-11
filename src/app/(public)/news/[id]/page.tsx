import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Pin } from "lucide-react";

import { isUuid } from "@/lib/budget";
import { fileKindLabel, fileSizeText, siteFileUrl } from "@/lib/site-content";
import { fetchPublicAnnouncement } from "@/lib/site-content-server";
import { thaiDate } from "@/lib/thai";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const a = isUuid(id) ? await fetchPublicAnnouncement(id).catch(() => null) : null;
  return { title: a?.title ?? "ข่าวประกาศ" };
}

/** ข่าวประกาศหนึ่งเรื่อง (เฉพาะที่เผยแพร่และยังไม่หมดอายุ) */
export default async function NewsDetailPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const a = await fetchPublicAnnouncement(id).catch(() => null);
  if (!a) notFound();
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/" className="text-primary underline underline-offset-4">
          ← หน้าแรก
        </Link>
      </p>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-muted-foreground">
        {a.is_pinned ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-sm font-semibold text-gold-foreground">
            <Pin className="size-3.5" aria-hidden />
            ปักหมุด
          </span>
        ) : null}
        ประกาศเมื่อ {thaiDate(a.published_on)}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-primary sm:text-3xl" data-testid="news-title">
        {a.title}
      </h1>
      {a.body ? (
        <div className="mt-6 text-lg leading-relaxed whitespace-pre-wrap" data-testid="news-body">
          {a.body}
        </div>
      ) : null}
      {a.files.length ? (
        <section className="mt-8 rounded-xl border bg-card p-5" data-testid="news-files">
          <h2 className="text-lg font-bold text-primary">ไฟล์แนบ</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {a.files.map((f) => (
              <li key={f.path}>
                <a
                  href={siteFileUrl(f.path)}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 text-primary underline underline-offset-4"
                >
                  <FileDown className="size-5 shrink-0" aria-hidden />
                  {f.name}
                </a>
                <span className="ml-2 text-sm text-muted-foreground">
                  {fileKindLabel(f.mime_type)} {fileSizeText(f.size_bytes)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
