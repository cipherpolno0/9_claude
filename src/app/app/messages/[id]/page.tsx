import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireWorkspace } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { CONTACT_STATUS_CLASS as STATUS_CLASS, CONTACT_STATUS_LABEL } from "@/lib/site-content";
import { fetchContactMessage } from "@/lib/site-content-server";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { MessageStatusForm } from "../message-form";

export const metadata: Metadata = { title: "ข้อความติดต่อ" };
export const dynamic = "force-dynamic";

/** ข้อความติดต่อหนึ่งรายการ (เปิดครั้งแรก = บันทึกว่าอ่านแล้ว สถานะ ใหม่ เป็น กำลังดำเนินการ) */
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspace();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const m = await fetchContactMessage(id);
  if (!m) notFound();
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/messages" className="text-primary underline underline-offset-4">
          ← ข้อความติดต่อ
        </Link>
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("rounded-full border px-2 py-0.5 font-semibold", STATUS_CLASS[m.status])} data-testid="message-status">
          {CONTACT_STATUS_LABEL[m.status]}
        </span>
        <span className="text-muted-foreground">
          หัวข้อ {m.contact_topics?.name} · ส่งเมื่อ {thaiDateTime(m.created_at)}
        </span>
      </p>
      <h1 className="mt-1 text-2xl font-bold text-primary" data-testid="message-subject">
        {m.subject}
      </h1>
      <dl className="mt-4 grid gap-2 rounded-xl border bg-card p-5 sm:grid-cols-[8rem_1fr]" data-testid="message-sender">
        <dt className="font-semibold text-muted-foreground">ผู้ส่ง</dt>
        <dd>{m.sender_name}</dd>
        <dt className="font-semibold text-muted-foreground">อีเมล</dt>
        <dd>
          {m.sender_email ? (
            <a href={`mailto:${m.sender_email}?subject=${encodeURIComponent(`ตอบ: ${m.subject}`)}`} className="text-primary underline underline-offset-4">
              {m.sender_email}
            </a>
          ) : (
            "-"
          )}
        </dd>
        <dt className="font-semibold text-muted-foreground">โทรศัพท์</dt>
        <dd>{m.sender_phone ? <a href={`tel:${m.sender_phone}`} className="text-primary underline underline-offset-4">{m.sender_phone}</a> : "-"}</dd>
      </dl>
      <div className="mt-4 rounded-xl border bg-card p-5 text-lg leading-relaxed whitespace-pre-wrap break-words" data-testid="message-body">
        {m.message}
      </div>
      <section className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-lg font-bold text-primary">การดำเนินการ</h2>
        {m.handled_at ? <p className="mb-2 text-sm text-muted-foreground">ปรับปรุงล่าสุด {thaiDateTime(m.handled_at)}</p> : null}
        <MessageStatusForm id={m.id} status={m.status} note={m.staff_note} />
      </section>
    </section>
  );
}
