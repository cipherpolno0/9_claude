import type { Metadata } from "next";
import Link from "next/link";

import { requireWorkspace } from "@/lib/auth/guards";
import { DOC_KIND_LABEL, ROUTE_ACTION_LABEL, type InboxItem } from "@/lib/docs";
import { fetchDocsCounts, fetchInbox, remindDocsDue } from "@/lib/docs-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

import { ReceiveRouteForm } from "../route-forms";
import { DocBadges, DocsNav } from "../ui";

export const metadata: Metadata = { title: "กล่องหนังสือเข้า" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

function Section({ title, items, children, testId }: { title: string; items: number; children: React.ReactNode; testId: string }) {
  return (
    <section className="mt-6" data-testid={testId}>
      <h2 className="text-lg font-bold text-primary">
        {title} <span className="text-base font-normal text-muted-foreground">({items.toLocaleString("th-TH")})</span>
      </h2>
      {items === 0 ? <p className="mt-2 text-muted-foreground">ไม่มีรายการ</p> : <ul className="mt-2 flex flex-col gap-3">{children}</ul>}
    </section>
  );
}

function Head({ i }: { i: InboxItem }) {
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-2 font-semibold">
        <DocBadges urgency={i.urgency} classification={i.classification} />
        {i.doc_no ? `ที่ ${i.doc_no}` : DOC_KIND_LABEL[i.kind]}
        {i.doc_date ? <span className="font-normal text-muted-foreground">ลงวันที่ {thaiDate(i.doc_date, "short")}</span> : null}
        {i.action === "forward" && i.status === "pending" ? (
          <span className="rounded border border-amber-500 px-1.5 text-sm text-amber-800" data-testid="unread-badge">
            ยังไม่เปิดอ่าน
          </span>
        ) : null}
      </p>
      <p className="mt-1">{i.subject ? `เรื่อง ${i.subject}` : "เรื่อง: (หนังสือลับ เห็นได้หลังผู้ลงทะเบียนลงรับ)"}</p>
    </>
  );
}

/** กล่องหนังสือเข้า: หนังสือถึงหน่วย (รอลงรับ รอตอบกลับ) และเรื่องที่เสนอ แจ้งถึงฉัน */
export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireWorkspace();
  const unit = one((await searchParams).unit);
  await remindDocsDue();
  const [all, counts] = await Promise.all([fetchInbox(), fetchDocsCounts()]);
  const items = unit ? all.filter((i) => i.to_unit_id === unit || i.to_unit_id === null) : all;
  const toUnit = items.filter((i) => i.action === "forward" && (i.status === "pending" || i.status === "read"));
  const toReply = items.filter((i) => i.action === "forward" && i.status === "received");
  const toMe = items.filter((i) => i.action !== "forward");

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">กล่องหนังสือเข้า</h1>
      <DocsNav current="inbox" counts={counts} showRegister={ctx.canViewDocs} />
      {unit ? (
        <p className="mt-3 text-sm">
          แสดงเฉพาะหน่วยที่เลือก ·{" "}
          <Link href="/app/docs/inbox" className="text-primary underline underline-offset-4">
            ดูทุกหน่วย
          </Link>
        </p>
      ) : null}

      <Section title="หนังสือถึงหน่วย รอลงรับ" items={toUnit.length} testId="inbox-units">
        {toUnit.map((i) => (
          <li key={i.route_id} className="rounded-lg border bg-card p-4" data-testid="inbox-item">
            <Head i={i} />
            <p className="text-sm text-muted-foreground">
              จาก {i.from_unit_name} ถึง {i.to_unit_name} · ส่งเมื่อ {thaiDateTime(i.sent_at)}
              {i.read_at ? ` · เปิดอ่านแล้ว ${thaiDateTime(i.read_at)}` : ""}
            </p>
            {i.message ? <p className="mt-1">ข้อความ: {i.message}</p> : null}
            {i.reply_required ? (
              <p className="mt-1 font-semibold text-amber-800">
                ต้องตอบกลับ{i.due_on ? ` ภายใน ${thaiDate(i.due_on, "short")}` : ""} (ตอบได้หลังลงรับ)
              </p>
            ) : null}
            {i.subject ? (
              <p className="mt-2">
                <Link href={`/app/docs/${i.document_id}`} className="font-semibold text-primary underline underline-offset-4">
                  เปิดอ่านหนังสือ
                </Link>
              </p>
            ) : null}
            {i.can_receive ? <ReceiveRouteForm routeId={i.route_id} /> : null}
          </li>
        ))}
      </Section>

      <Section title="ลงรับแล้ว รอตอบกลับ" items={toReply.length} testId="inbox-reply">
        {toReply.map((i) => (
          <li key={i.route_id} className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950" data-testid="reply-item">
            <Head i={i} />
            <p className="text-sm">
              จาก {i.from_unit_name} ถึง {i.to_unit_name}
              {i.due_on ? ` · ตอบภายใน ${thaiDate(i.due_on, "short")}` : ""}
            </p>
            {i.received_document_id ? (
              <p className="mt-2">
                <Link href={`/app/docs/${i.received_document_id}`} className="font-semibold underline underline-offset-4">
                  ตอบกลับ
                </Link>
              </p>
            ) : null}
          </li>
        ))}
      </Section>

      <Section title="เสนอและแจ้งถึงท่าน" items={toMe.length} testId="inbox-me">
        {toMe.map((i) => (
          <li key={i.route_id} className="rounded-lg border bg-card p-4" data-testid="me-item">
            <p className="text-sm font-semibold text-primary">
              {ROUTE_ACTION_LABEL[i.action]} โดย {i.from_name ?? "-"} · {thaiDateTime(i.sent_at)}
            </p>
            <Head i={i} />
            {i.message ? <p className="mt-1">ข้อความ: {i.message}</p> : null}
            <p className="mt-2">
              <Link href={`/app/docs/${i.document_id}`} className="font-semibold text-primary underline underline-offset-4">
                {i.action === "propose" ? "เปิดหนังสือเพื่อสั่งการ" : "เปิดหนังสือ"}
              </Link>
            </p>
          </li>
        ))}
      </Section>
    </section>
  );
}
