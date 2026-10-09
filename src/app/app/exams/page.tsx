import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { examName, roundWindow } from "@/lib/exam-forms";
import { fetchRegisterRounds } from "@/lib/exam-forms-server";
import { findWorkspaceMenu } from "@/lib/site";
import { thaiDate } from "@/lib/thai";
import { todayInBangkok } from "@/lib/venues";

const menu = findWorkspaceMenu("/app/exams");

export const metadata: Metadata = { title: menu.title };

export default async function WorkspaceExamsPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const ctx = await requireMenu(menu.href);
  const { denied } = await searchParams;
  const rounds = await fetchRegisterRounds();
  const today = todayInBangkok();

  const cards = [
    {
      href: "/app/exams/register",
      title: "สมัครสอบ: ดาวน์โหลดแม่แบบบัญชี ศ.",
      text: "เลือกรอบ สำนักหรือสถานศึกษาของท่าน และสนามสอบ แล้วดาวน์โหลดแม่แบบที่เติมหัวแฟ้มไว้แล้ว",
    },
    {
      href: "/app/exams/batches/new",
      title: "อัปโหลดรายชื่อผู้สมัคร",
      text: "อัปโหลดไฟล์บัญชี ศ. ที่กรอกแล้ว ระบบตรวจทุกแถว แสดงตัวอย่าง แล้วจึงยืนยัน",
    },
    {
      href: "/app/exams/batches",
      title: "ชุดรายชื่อผู้สมัครสอบ",
      text: "ดูผลการตรวจ ยืนยัน หรือถอนชุดที่อัปโหลดแล้ว และดาวน์โหลดรายการข้อผิดพลาด",
    },
    ...(ctx.canManageExamRounds
      ? [{ href: "/app/exams/rounds", title: "รอบสมัครสอบ", text: "สร้างรอบ กำหนดวันรับสมัครและวันสอบ เปิดและปิดรับสมัคร (ส่วนกลาง)" }]
      : []),
    { href: "/downloads", title: "แม่แบบเปล่าและคู่มือการกรอก", text: "หน้าดาวน์โหลดสาธารณะ ใช้ได้โดยไม่ต้องล็อกอิน" },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-1 text-muted-foreground">
        สมัครสอบนักธรรมและธรรมศึกษาด้วยแฟ้ม Excel บัญชี ศ. ตามแบบของสำนักงานแม่กองธรรม (การส่งรายชื่อและผลสอบจะเพิ่มในบทต่อไป)
      </p>
      {denied ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          หน้านั้นใช้ได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ
        </p>
      ) : null}

      <ul className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="exam-menu">
        {cards.map((c) => (
          <li key={c.href}>
            <Link href={c.href} prefetch={false} className="block h-full rounded-xl border bg-card p-4 hover:bg-secondary">
              <span className="text-lg font-bold text-primary">{c.title}</span>
              <span className="mt-1 block text-muted-foreground">{c.text}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-bold text-primary">รอบที่เปิดรับสมัคร</h2>
      {rounds.length === 0 ? (
        <p className="mt-2 text-muted-foreground">ขณะนี้ยังไม่มีรอบที่เปิดรับสมัคร</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" data-testid="open-rounds">
          {rounds.map((r) => {
            const w = roundWindow({ ...r, is_active: true }, today);
            return (
              <li key={r.id} className="rounded-lg border bg-card px-4 py-3">
                <span className="font-semibold">
                  {examName(r.exam_type, r.level)} ปีการศึกษา {r.year_be}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">({r.form_code ?? "ยังไม่มีแบบ ศ."})</span>
                <span className="block text-sm">
                  รับสมัคร {thaiDate(r.opens_on, "short")} – {thaiDate(r.closes_on, "short")} · สอบ{" "}
                  {thaiDate(r.exam_starts_on, "short")}
                  {r.exam_ends_on && r.exam_ends_on !== r.exam_starts_on ? ` – ${thaiDate(r.exam_ends_on, "short")}` : ""}
                  <span className={w.accepting ? "ml-2 font-semibold text-green-800" : "ml-2 text-muted-foreground"}>{w.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
