import Link from "next/link";
import { Paperclip, Pin } from "lucide-react";

import type { PublicAnnouncement } from "@/lib/site-content";
import { thaiDate } from "@/lib/thai";

/** รายการข่าวประกาศ (หน้าแรกและหน้ารวมข่าว) ปักหมุดขึ้นก่อน */
export function NewsList({ items }: { items: PublicAnnouncement[] }) {
  if (items.length === 0) return <p className="text-muted-foreground">ยังไม่มีข่าวประกาศ</p>;
  return (
    <ul className="flex flex-col gap-3" data-testid="news-list">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={`/news/${a.id}`}
            prefetch={false}
            className="block rounded-xl border bg-card p-4 hover:bg-secondary"
            data-testid="news-item"
          >
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {a.is_pinned ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 font-semibold text-gold-foreground" data-testid="pinned">
                  <Pin className="size-3.5" aria-hidden />
                  ปักหมุด
                </span>
              ) : null}
              {thaiDate(a.published_on)}
              {a.file_count > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="size-3.5" aria-hidden />
                  ไฟล์แนบ {a.file_count}
                </span>
              ) : null}
            </span>
            <span className="mt-1 block text-lg font-semibold text-primary">{a.title}</span>
            {a.excerpt ? <span className="mt-1 line-clamp-2 block text-muted-foreground">{a.excerpt}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
