import type { Metadata } from "next";
import Link from "next/link";

import { requireWorkspace } from "@/lib/auth/guards";
import { CONTACT_STATUS, CONTACT_STATUS_CLASS as STATUS_CLASS, CONTACT_STATUS_LABEL } from "@/lib/site-content";
import { fetchContactMessages, fetchMyContactTopics } from "@/lib/site-content-server";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "ข้อความติดต่อ" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));


/** กล่องข้อความจากแบบฟอร์มติดต่อเรา: เฉพาะหัวข้อที่ผู้ใช้เป็นผู้รับ (ผู้ดูแลระบบเห็นทุกหัวข้อ) */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireWorkspace();
  const sp = await searchParams;
  const topics = await fetchMyContactTopics();
  const topic = topics.some((t) => t.key === one(sp.topic)) ? one(sp.topic) : "";
  const status = (CONTACT_STATUS as readonly string[]).includes(one(sp.status)) ? one(sp.status) : "";
  const messages = topics.length ? await fetchContactMessages({ topic: topic || undefined, status: status || undefined }) : [];
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(topic ? { topic } : {}), ...(status ? { status } : {}), ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/app/messages${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ข้อความติดต่อ</h1>
      <p className="mt-1 text-muted-foreground">ข้อความจากแบบฟอร์ม ติดต่อเรา ของหัวข้อที่ท่านเป็นผู้รับ ข้อมูลผู้ส่ง (ชื่อ อีเมล เบอร์) ใช้เพื่อติดต่อกลับเท่านั้น</p>
      {topics.length === 0 ? (
        <p className="mt-6 rounded-lg border bg-card p-4 text-muted-foreground" data-testid="messages-none">
          ท่านไม่ได้เป็นผู้รับข้อความติดต่อของหัวข้อใด (ผู้ดูแลระบบกำหนดได้ที่ ผู้ดูแลระบบ &gt; ติดต่อเรา)
        </p>
      ) : (
        <>
          <nav aria-label="หัวข้อ" className="mt-6 flex flex-wrap gap-2" data-testid="message-topics">
            <Link href={q({ topic: "" })} aria-current={!topic ? "page" : undefined} className={cn("rounded-full border px-3 py-1", !topic ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}>
              ทุกหัวข้อ
            </Link>
            {topics.map((t) => (
              <Link
                key={t.key}
                href={q({ topic: t.key })}
                aria-current={topic === t.key ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1", topic === t.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}
              >
                {t.name}
                {t.unread ? <span className="ml-1 rounded-full bg-destructive px-1.5 text-sm font-bold text-white">{t.unread}</span> : null}
              </Link>
            ))}
          </nav>
          <nav aria-label="สถานะ" className="mt-3 flex flex-wrap gap-2">
            {["", ...CONTACT_STATUS].map((s) => (
              <Link key={s || "all"} href={q({ status: s })} aria-current={status === s ? "page" : undefined} className={cn("rounded-md border px-3 py-1 text-sm", status === s ? "border-primary font-semibold" : "bg-card hover:bg-secondary")}>
                {s ? CONTACT_STATUS_LABEL[s as keyof typeof CONTACT_STATUS_LABEL] : "ทุกสถานะ"}
              </Link>
            ))}
          </nav>
          {messages.length === 0 ? (
            <p className="mt-6 text-muted-foreground" data-testid="messages-empty">ไม่มีข้อความ</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2" data-testid="message-list">
              {messages.map((m) => (
                <li key={m.id}>
                  <Link href={`/app/messages/${m.id}`} prefetch={false} className={cn("block rounded-xl border bg-card p-4 hover:bg-secondary", m.status === "new" && "border-l-4 border-l-destructive")} data-testid="message-row">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={cn("rounded-full border px-2 py-0.5 font-semibold", STATUS_CLASS[m.status])}>{CONTACT_STATUS_LABEL[m.status]}</span>
                      <span className="text-muted-foreground">
                        {m.contact_topics?.name} · {thaiDateTime(m.created_at)}
                      </span>
                    </span>
                    <span className={cn("mt-1 block", m.status === "new" ? "font-bold" : "font-semibold")}>{m.subject}</span>
                    <span className="block text-sm text-muted-foreground">จาก {m.sender_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
