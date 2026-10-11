import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/guards";
import { fullName } from "@/lib/auth/session";
import { fetchContactSettings, fetchTopicRecipients } from "@/lib/site-content-server";
import { createClient } from "@/lib/supabase/server";

import { ContactSettingsForm, RecipientAdder, RemoveRecipientButton } from "../site-forms";

export const metadata: Metadata = { title: "ติดต่อเรา" };
export const dynamic = "force-dynamic";

type UserRow = { id: string; title_prefix: string; first_name: string; monastic_name: string; last_name: string; email: string };

/** ข้อมูลติดต่อของหน่วยงาน และผู้รับข้อความแต่ละหัวข้อ (ผู้ดูแลระบบ) */
export default async function ContactAdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [settings, recipients, topicsRes, rolesRes, usersRes] = await Promise.all([
    fetchContactSettings(),
    fetchTopicRecipients(),
    supabase.from("contact_topics").select("key, name").order("sort_order"),
    supabase.from("roles").select("key, name").order("sort_order"),
    supabase.from("profiles").select("id, title_prefix, first_name, monastic_name, last_name, email").eq("status", "active").order("first_name").limit(1000),
  ]);
  const topics = (topicsRes.data as { key: string; name: string }[] | null) ?? [];
  const roles = (rolesRes.data as { key: string; name: string }[] | null) ?? [];
  const users = ((usersRes.data as UserRow[] | null) ?? []).map((u) => ({ id: u.id, name: `${fullName(u)} (${u.email})` }));
  const roleName = new Map(roles.map((r) => [r.key, r.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/admin" className="text-primary underline underline-offset-4">
          ← ผู้ดูแลระบบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ติดต่อเรา</h1>
      <p className="mt-1 text-muted-foreground">
        ข้อมูลบน{" "}
        <Link href="/contact" className="text-primary underline underline-offset-4" target="_blank">
          หน้าติดต่อเรา
        </Link>{" "}
        (หน้าเดียวทั้งเว็บ) ช่องที่เว้นว่างจะแสดงว่า ยังไม่ได้ระบุ
      </p>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-xl font-bold text-primary">ข้อมูลติดต่อของหน่วยงาน</h2>
        {settings ? <ContactSettingsForm value={settings} /> : <p className="text-muted-foreground">อ่านข้อมูลไม่ได้</p>}
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5" data-testid="topic-recipients">
        <h2 className="text-xl font-bold text-primary">ผู้รับข้อความแต่ละหัวข้อ</h2>
        <p className="mt-1 text-muted-foreground">
          ข้อความจากแบบฟอร์มเข้า กล่องข้อความติดต่อ (/app/messages) และแจ้งเตือนผู้รับของหัวข้อนั้น เลือกได้ทั้งบทบาท (ทุกคนที่มีบทบาทนั้น) และผู้ใช้รายคน
          หัวข้อที่ยังไม่กำหนดผู้รับ ข้อความจะส่งถึงผู้ดูแลระบบ
        </p>
        <ul className="mt-4 flex flex-col gap-4">
          {topics.map((t) => {
            const list = recipients.filter((r) => r.topic_key === t.key);
            return (
              <li key={t.key} className="rounded-lg border p-4" data-testid={`topic-${t.key}`}>
                <p className="text-lg font-semibold">{t.name}</p>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่กำหนด (ส่งถึงผู้ดูแลระบบ)</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {list.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2" data-testid="recipient-row">
                        <span>{r.role_key ? `บทบาท: ${roleName.get(r.role_key) ?? r.role_key}` : `ผู้ใช้: ${userName.get(r.user_id ?? "") ?? "(บัญชีไม่ใช้งาน)"}`}</span>
                        <RemoveRecipientButton id={r.id} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3">
                  <RecipientAdder topic={t.key} roles={roles} users={users} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
