import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ClipboardCheck, Inbox, ListTodo, MessageSquare } from "lucide-react";

import { ErrorText } from "@/components/form";
import { PendingRequestsBox } from "@/components/pending-requests-box";
import { requireWorkspace } from "@/lib/auth/guards";
import { fullName } from "@/lib/auth/session";
import { LEVEL_LABEL, SECT_LABEL, type OrgLevel, type Sect } from "@/lib/org-units";
import { remindBudgetAlerts } from "@/lib/budget-server";
import { remindOverduePlaceRequests } from "@/lib/place-requests-server";
import { fetchMyPendingRequests } from "@/lib/requests/queries";
import { DOC_URGENCY_LABEL, ROUTE_ACTION_LABEL } from "@/lib/docs";
import { fetchDocsCounts, fetchInbox } from "@/lib/docs-server";
import { getMyNotifications } from "@/lib/notifications/actions";
import { fetchMyContactTopics } from "@/lib/site-content-server";
import { createClient } from "@/lib/supabase/server";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { roleShortcuts } from "./shortcuts";

export const metadata: Metadata = { title: "แดชบอร์ด" };

type MyUnit = {
  role_key: string;
  role_name: string;
  org_unit_id: string | null;
  org_unit_name: string | null;
  org_unit_code: string | null;
  level: OrgLevel | null;
  sect: Sect | null;
  descendant_count: number;
  all_units: boolean;
};

type Descendant = { id: string; name: string; level: OrgLevel; is_active: boolean; depth: number; code: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { denied } = await searchParams;
  const supabase = await createClient();

  // แจ้งเตือนผู้พิจารณาของคำขอจัดตั้ง-ยุบสำนักที่เกินกำหนด (ไม่เกินวันละ 1 ครั้งต่อขั้น) ทุกครั้งที่มีผู้เปิดแดชบอร์ด
  const [{ data }, pendingRequests, docCounts, inbox, notes, contactTopics] = await Promise.all([
    supabase.rpc("my_org_units"),
    fetchMyPendingRequests(),
    fetchDocsCounts(),
    fetchInbox(),
    getMyNotifications(),
    fetchMyContactTopics(),
    remindOverduePlaceRequests(),
    remindBudgetAlerts(),
  ]);
  const unreadMessages = contactTopics.reduce((n, t) => n + t.unread, 0);
  const shortcuts = roleShortcuts(ctx);
  const tiles = [
    { href: "/app/approvals", label: "งานรอพิจารณา", n: pendingRequests.length, icon: ClipboardCheck, show: true },
    { href: "/app/docs/inbox", label: "หนังสือเข้า", n: docCounts.inbox, icon: Inbox, show: ctx.canViewDocs || docCounts.inbox > 0 },
    { href: "/app/docs/tasks", label: "งานสารบรรณของฉัน", n: docCounts.tasks, icon: ListTodo, show: ctx.canViewDocs || docCounts.tasks > 0 },
    { href: "/app/messages", label: "ข้อความติดต่อใหม่", n: unreadMessages, icon: MessageSquare, show: contactTopics.length > 0 },
    { href: "#notifications", label: "แจ้งเตือนยังไม่อ่าน", n: notes.unread, icon: Bell, show: true },
  ].filter((t) => t.show);
  const myUnits = (data as MyUnit[] | null) ?? [];
  const seesAll = myUnits.some((u) => u.all_units);

  let totalUnits = 0;
  if (seesAll) {
    const { count } = await supabase.from("org_units").select("id", { count: "exact", head: true }).eq("is_active", true);
    totalUnits = count ?? 0;
  }

  // รายชื่อหน่วยใต้สังกัดของแต่ละหน่วยที่ดูแล
  const scoped = myUnits.filter((u) => u.org_unit_id && !u.all_units);
  const descendants = new Map<string, Descendant[]>();
  await Promise.all(
    [...new Set(scoped.map((u) => u.org_unit_id!))].map(async (id) => {
      const { data: rows } = await supabase.rpc("descendants_of", { p_org_unit_id: id });
      descendants.set(
        id,
        ((rows as Descendant[] | null) ?? [])
          .filter((d) => d.is_active)
          .sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true })),
      );
    }),
  );

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">แดชบอร์ด</h1>
      <p className="mt-1 text-muted-foreground">
        ยินดีต้อนรับ {ctx.profile ? fullName(ctx.profile) : ctx.user.email}
      </p>

      {denied ? (
        <div className="mt-4">
          <ErrorText>ท่านไม่มีสิทธิ์เข้าหน้าที่เรียก ระบบจึงพากลับมาที่แดชบอร์ด</ErrorText>
        </div>
      ) : null}

      <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" data-testid="dash-tiles">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link href={t.href} className={cn("block h-full rounded-xl border bg-card p-4 hover:bg-secondary", t.n > 0 && "border-primary")} data-testid="dash-tile">
                <Icon className="size-6 text-primary" aria-hidden />
                <span className="mt-1 block text-3xl font-bold tabular-nums">{t.n.toLocaleString("th-TH")}</span>
                <span className="block text-muted-foreground">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {shortcuts.length ? (
        <section className="mt-6 rounded-xl border bg-card p-5" data-testid="role-shortcuts">
          <h2 className="text-xl font-bold text-primary">ทางลัดตามบทบาท</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <li key={s.href}>
                <Link href={s.href} prefetch={false} className="inline-block rounded-full border px-3 py-1.5 hover:bg-secondary">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6">
        <PendingRequestsBox items={pendingRequests} />
      </div>

      {inbox.length ? (
        <section className="mt-6 rounded-xl border bg-card p-5" data-testid="dash-inbox">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-primary">หนังสือเข้าใหม่ ({inbox.length})</h2>
            <Link href="/app/docs/inbox" className="text-primary underline underline-offset-4">
              กล่องหนังสือเข้า
            </Link>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {inbox.slice(0, 5).map((i) => (
              <li key={i.route_id}>
                <Link href={`/app/docs/${i.document_id}`} prefetch={false} className="block rounded-lg border p-3 hover:bg-secondary">
                  <span className="block font-semibold">
                    {i.urgency !== "normal" ? <span className="mr-1 text-destructive">[{DOC_URGENCY_LABEL[i.urgency]}]</span> : null}
                    {i.subject || "(หนังสือลับ)"}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {ROUTE_ACTION_LABEL[i.action]} · จาก {i.from_unit_name}
                    {i.doc_no ? ` · ที่ ${i.doc_no}` : ""} · {thaiDateTime(i.sent_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="notifications" className="mt-6 scroll-mt-20 rounded-xl border bg-card p-5" data-testid="dash-notifications">
        <h2 className="text-xl font-bold text-primary">แจ้งเตือนล่าสุด</h2>
        {notes.items.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ยังไม่มีแจ้งเตือน</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {notes.items.slice(0, 6).map((n) => (
              <li key={n.id} className={cn("rounded-lg border p-3", !n.read_at && "border-primary")}>
                {n.link ? (
                  <Link href={n.link} prefetch={false} className={cn("block text-primary underline-offset-4 hover:underline", !n.read_at && "font-semibold")}>
                    {n.title}
                  </Link>
                ) : (
                  <span className={cn(!n.read_at && "font-semibold")}>{n.title}</span>
                )}
                {n.body ? <span className="block text-sm text-muted-foreground">{n.body}</span> : null}
                <span className="block text-sm text-muted-foreground">{thaiDateTime(n.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted-foreground">ทำเครื่องหมายว่าอ่านแล้วได้ที่กระดิ่งบนแถบบน</p>
      </section>

      <div className="mt-6 rounded-xl border bg-card p-5" data-testid="my-units">
        <h2 className="text-xl font-bold text-primary">เขตที่ท่านดูแล</h2>
        {myUnits.length === 0 ? (
          <p className="mt-2 text-muted-foreground">บัญชีของท่านยังไม่มีบทบาท กรุณาติดต่อผู้ดูแลระบบ</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {myUnits.map((u, i) => {
              const list = u.org_unit_id ? (descendants.get(u.org_unit_id) ?? []) : [];
              return (
                <li key={i} className="rounded-lg border p-3">
                  <p className="font-semibold">
                    {u.role_name}
                    {u.org_unit_name ? ` · ${u.org_unit_name}` : ""}
                  </p>
                  {u.all_units ? (
                    <p className="text-muted-foreground">
                      เข้าถึงได้ทุกเขตปกครอง ทุกนิกาย ({totalUnits.toLocaleString("th-TH")} หน่วย)
                    </p>
                  ) : u.org_unit_id ? (
                    <>
                      <p className="text-muted-foreground">
                        {u.level ? LEVEL_LABEL[u.level] : ""}
                        {u.sect ? ` · ${SECT_LABEL[u.sect]}` : ""} · หน่วยใต้สังกัด{" "}
                        {list.length.toLocaleString("th-TH")} หน่วย
                      </p>
                      {list.length > 0 ? (
                        <details className="mt-2">
                          <summary className="w-fit cursor-pointer font-medium text-primary underline underline-offset-4">
                            ดูรายชื่อหน่วยใต้สังกัด
                          </summary>
                          <ul className="mt-2 flex flex-col gap-0.5">
                            {list.slice(0, 300).map((d) => (
                              <li key={d.id} style={{ paddingLeft: `${(d.depth - 1) * 1.25}rem` }}>
                                <span className="mr-2 rounded bg-accent px-1.5 py-0.5 text-sm font-semibold">
                                  {LEVEL_LABEL[d.level]}
                                </span>
                                {d.name}
                              </li>
                            ))}
                          </ul>
                          {list.length > 300 ? (
                            <p className="mt-1 text-sm text-muted-foreground">แสดง 300 หน่วยแรก</p>
                          ) : null}
                        </details>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground">บทบาทนี้ไม่ผูกกับเขตปกครอง</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

    </section>
  );
}
