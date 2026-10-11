import type { Metadata } from "next";
import Link from "next/link";

import { NewsList } from "@/components/public/news-list";
import { Button } from "@/components/ui/button";
import { fetchPublicAnnouncements } from "@/lib/site-content-server";

export const metadata: Metadata = { title: "ข่าวประกาศทั้งหมด" };

const PAGE_SIZE = 20;

/** ข่าวประกาศทั้งหมด (ปักหมุดขึ้นก่อน แล้วเรียงวันเผยแพร่ล่าสุด) */
export default async function NewsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Math.min(500, Number((await searchParams).page) || 1));
  const items = await fetchPublicAnnouncements(PAGE_SIZE, (page - 1) * PAGE_SIZE).catch(() => []);
  const total = Number(items[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/" className="text-primary underline underline-offset-4">
          ← หน้าแรก
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ข่าวประกาศทั้งหมด</h1>
      <div className="mt-6">
        <NewsList items={items} />
      </div>
      {pages > 1 ? (
        <nav aria-label="หน้า" className="mt-6 flex flex-wrap items-center gap-2">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/news?page=${page - 1}`}>ก่อนหน้า</Link>
            </Button>
          ) : null}
          <span>
            หน้า {page} / {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline">
              <Link href={`/news?page=${page + 1}`}>ถัดไป</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
