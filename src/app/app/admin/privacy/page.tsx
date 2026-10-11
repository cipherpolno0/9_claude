import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThaiDateInput } from "@/components/thai-date-input";
import { selectClass } from "@/components/form";
import { requireAdmin } from "@/lib/auth/guards";
import {
  ACCESS_ACTION_LABEL,
  ACCESS_SUBJECT_LABEL,
  ACCESS_SUBJECT_TYPES,
  accessSubjectHref,
  type AccessSubjectType,
} from "@/lib/privacy";
import { fetchAccessLogs, fetchPrivacyTexts, fetchRetentionSummary } from "@/lib/privacy-server";
import { createClient } from "@/lib/supabase/server";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { PrivacyTextForm, RetentionForm } from "./privacy-forms";

export const metadata: Metadata = { title: "ข้อมูลส่วนบุคคลและความปลอดภัย" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "texts", label: "นโยบายและข้อความแจ้ง" },
  { key: "retention", label: "อายุการเก็บ" },
  { key: "logs", label: "บันทึกการเข้าดู" },
] as const;
const PAGE = 100;
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** ข้อมูลส่วนบุคคล (บทที่ 31): นโยบาย ข้อความแจ้ง อายุการเก็บ บันทึกการเข้าดูข้อมูลบุคคล (ผู้ดูแลระบบเท่านั้น) */
export default async function PrivacyAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  };
  const tab = TABS.some((t) => t.key === one("tab")) ? one("tab") : "texts";

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/admin" className="text-primary underline underline-offset-4">
          ← ผู้ดูแลระบบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ข้อมูลส่วนบุคคลและความปลอดภัย</h1>
      <nav aria-label="หัวข้อ" className="mt-4 flex flex-wrap gap-2" data-testid="privacy-tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/admin/privacy?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "texts" ? <TextsTab /> : tab === "retention" ? <RetentionTab /> : <LogsTab one={one} />}
    </section>
  );
}

async function TextsTab() {
  const texts = await fetchPrivacyTexts();
  const policy = texts.filter((t) => t.kind === "policy");
  const notices = texts.filter((t) => t.kind === "notice");
  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-muted-foreground">
        หัวข้อตั้งต้นตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล เนื้อความให้หน่วยงานกรอกเอง (ระบบไม่เดาเนื้อความ) หัวข้อที่ยังว่างแสดงบนหน้า{" "}
        <Link href="/privacy" target="_blank" className="text-primary underline underline-offset-4">
          นโยบายความเป็นส่วนตัว
        </Link>{" "}
        ว่า ยังไม่ได้ระบุ
      </p>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">หัวข้อนโยบาย</h2>
        <ol className="mt-3 flex flex-col gap-6">
          {policy.map((t) => (
            <li key={t.key} className="border-b pb-5 last:border-b-0">
              <PrivacyTextForm k={t.key} title={t.title} body={t.body} />
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ข้อความแจ้งวัตถุประสงค์บนแบบฟอร์ม</h2>
        <p className="text-muted-foreground">แสดงเหนือแบบฟอร์มที่เก็บข้อมูลส่วนบุคคล พร้อมลิงก์ไปหน้านโยบาย</p>
        <ol className="mt-3 flex flex-col gap-6">
          {notices.map((t) => (
            <li key={t.key} className="border-b pb-5 last:border-b-0">
              <PrivacyTextForm k={t.key} title={t.title} body={t.body} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

async function RetentionTab() {
  const rows = await fetchRetentionSummary();
  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-muted-foreground">
        กรอกจำนวนปีที่เก็บข้อมูลแต่ละชนิดตามระเบียบของหน่วยงาน (ว่าง = ไม่กำหนด) ระบบนับรายการที่ครบอายุแล้วให้ตรวจ แต่ไม่ลบข้อมูลเอง
        อายุการเก็บหนังสือราชการตั้งแยกที่{" "}
        <Link href="/app/docs/retention" className="text-primary underline underline-offset-4">
          สารบรรณ &gt; อายุการเก็บ
        </Link>
      </p>
      <ul className="flex flex-col gap-3" data-testid="retention-rows">
        {rows.map((r) => (
          <li key={r.data_key} className="rounded-xl border bg-card p-4" data-testid="retention-row">
            <p className="font-semibold">{r.label}</p>
            <p className="text-sm text-muted-foreground">{r.basis}</p>
            <p className={cn("mt-1 text-sm", r.due_count ? "font-semibold text-destructive" : "text-muted-foreground")} data-testid="retention-due">
              {r.years === null
                ? "ยังไม่กำหนดอายุการเก็บ"
                : r.due_count
                  ? `ครบอายุแล้ว ${Number(r.due_count).toLocaleString("th-TH")} รายการ (เก่าสุด ${r.oldest ? thaiDate(r.oldest, "short") : "-"})`
                  : "ยังไม่มีรายการที่ครบอายุ"}
            </p>
            <div className="mt-3">
              <RetentionForm k={r.data_key} years={r.years} note={r.note} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function LogsTab({ one }: { one: (k: string) => string }) {
  const type = (ACCESS_SUBJECT_TYPES as readonly string[]).includes(one("type")) ? one("type") : "";
  const email = one("email").toLowerCase().slice(0, 200);
  const from = isoDate(one("from"));
  const to = isoDate(one("to"));
  const subject = one("subject").slice(0, 100);
  const page = Math.max(1, Math.floor(Number(one("page")) || 1));
  let viewer: string | null = null;
  let unknownEmail = false;
  if (email) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    viewer = (data?.id as string | undefined) ?? null;
    unknownEmail = !viewer;
  }
  const { rows, total } = unknownEmail
    ? { rows: [], total: 0 }
    : await fetchAccessLogs({ viewer, type, subject, from, to }, PAGE, (page - 1) * PAGE);
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ tab: "logs", type, email, subject, from: from ?? "", to: to ?? "", ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return p.toString();
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-muted-foreground">
        ระบบบันทึกเมื่อผู้ใช้เปิดประวัติบุคลากร ผู้สมัครสอบ ข้อความติดต่อ ค้นหารายบุคคล และส่งออกหรือพิมพ์บัญชีที่มีข้อมูลบุคคล (เปิดซ้ำภายใน 1 นาทีนับครั้งเดียว)
      </p>
      <form method="get" action="/app/admin/privacy" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" data-testid="log-filters">
        <input type="hidden" name="tab" value="logs" />
        <label className="flex flex-col gap-1">
          ชนิดข้อมูล
          <select name="type" defaultValue={type} className={selectClass}>
            <option value="">ทั้งหมด</option>
            {ACCESS_SUBJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCESS_SUBJECT_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          อีเมลผู้เข้าดู
          <Input name="email" type="email" defaultValue={email} maxLength={200} />
        </label>
        <ThaiDateInput label="ตั้งแต่วันที่" name="from" id="log-from" defaultValue={from} />
        <ThaiDateInput label="ถึงวันที่" name="to" id="log-to" defaultValue={to} />
        {subject ? <input type="hidden" name="subject" value={subject} /> : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit">แสดง</Button>
          <Button asChild variant="outline">
            <a href={`/app/admin/privacy/logs/export?${qs({})}`}>ส่งออก Excel</a>
          </Button>
          {subject ? (
            <Button asChild variant="ghost">
              <Link href={`/app/admin/privacy?${qs({ subject: "" })}`}>ล้างตัวกรองรายการ</Link>
            </Button>
          ) : null}
        </div>
      </form>
      {unknownEmail ? <p className="text-destructive">ไม่พบผู้ใช้ที่มีอีเมลนี้</p> : null}
      <p className="text-muted-foreground" data-testid="log-total">
        ทั้งหมด {total.toLocaleString("th-TH")} รายการ
      </p>
      <ul className="flex flex-col gap-2" data-testid="log-rows">
        {rows.map((r) => {
          const href = accessSubjectHref(r.subject_type as AccessSubjectType, r.subject_id);
          return (
            <li key={r.id} className="rounded-lg border bg-card p-3" data-testid="log-row">
              <p className="text-sm text-muted-foreground">{thaiDateTime(r.created_at)}</p>
              <p>
                <span className="font-semibold">{r.viewer_name || r.viewer_email}</span>{" "}
                <span className="text-muted-foreground">({r.viewer_email})</span> {ACCESS_ACTION_LABEL[r.action]}{" "}
                {ACCESS_SUBJECT_LABEL[r.subject_type as AccessSubjectType] ?? r.subject_type}
                {r.subject_name ? (
                  <>
                    {" "}
                    ของ{" "}
                    {href ? (
                      <Link href={href} className="text-primary underline underline-offset-4">
                        {r.subject_name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{r.subject_name}</span>
                    )}
                  </>
                ) : null}
              </p>
              {r.detail ? <p className="text-sm text-muted-foreground">{r.detail}</p> : null}
              {r.subject_id ? (
                <p className="text-sm">
                  <Link href={`/app/admin/privacy?${qs({ subject: r.subject_id, type: r.subject_type })}`} className="text-primary underline underline-offset-4">
                    ใครเปิดรายการนี้บ้าง
                  </Link>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {pages > 1 ? (
        <nav aria-label="หน้า" className="flex flex-wrap gap-2">
          {page > 1 ? (
            <Link href={`/app/admin/privacy?${qs({ page: String(page - 1) })}`} className="rounded border px-3 py-1">
              ก่อนหน้า
            </Link>
          ) : null}
          <span className="px-3 py-1">
            หน้า {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={`/app/admin/privacy?${qs({ page: String(page + 1) })}`} className="rounded border px-3 py-1">
              ถัดไป
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
