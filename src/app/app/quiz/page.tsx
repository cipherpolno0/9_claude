import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { UnderConstruction } from "@/components/under-construction";
import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { COURSE_LEVELS, COURSE_LEVEL_LABEL } from "@/lib/quiz";
import { DEFAULT_MIN_QUESTIONS, fetchBankSummary } from "@/lib/quiz-server";
import { findWorkspaceMenu } from "@/lib/site";
import { cn } from "@/lib/utils";

import { QuizNav } from "./quiz-nav";

const menu = findWorkspaceMenu("/app/quiz");

export const metadata: Metadata = { title: menu.title };
export const dynamic = "force-dynamic";

const n = (value: number) => value.toLocaleString("th-TH");

export default async function WorkspaceQuizPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu(menu.href);
  // ส่วนของผู้เรียน (บทเรียนและแบบทดสอบ) เปิดในบทถัดไป ตอนนี้มีเฉพาะส่วนของผู้จัดการคลังข้อสอบ
  if (!ctx.canManageQuiz) return <UnderConstruction title={menu.title} description={menu.description} />;

  const onlyLow = (await searchParams).show === "low";
  const courses = await fetchBankSummary();
  const min = ctx.settings.quiz_min_questions_per_unit ?? DEFAULT_MIN_QUESTIONS;

  const mcq = courses.filter((c) => c.has_mcq);
  const published = mcq.reduce((sum, c) => sum + c.published, 0);
  const draft = mcq.reduce((sum, c) => sum + c.draft, 0);
  const lowUnits = mcq.flatMap((c) => c.units.filter((u) => u.published < min).map((u) => ({ course: c, unit: u })));
  const noUnit = mcq.filter((c) => c.units.length === 0);

  const cards = [
    { label: "ข้อสอบที่เผยแพร่แล้ว", value: `${n(published)} ข้อ`, testid: "card-published" },
    { label: "ข้อสอบฉบับร่าง", value: `${n(draft)} ข้อ`, testid: "card-draft", href: "/app/quiz/questions?f_status=draft" },
    { label: `หน่วยที่มีข้อสอบน้อยกว่า ${n(min)} ข้อ`, value: `${n(lowUnits.length)} หน่วย`, testid: "card-low", warn: lowUnits.length > 0 },
    { label: "รายวิชาที่ยังไม่มีหน่วยการเรียน", value: `${n(noUnit.length)} รายวิชา`, testid: "card-nounit", warn: noUnit.length > 0 },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-1 text-muted-foreground">
        จำนวนข้อสอบปรนัยของแต่ละรายวิชาและหน่วยการเรียน ระบบเตือนหน่วยที่มีข้อสอบเผยแพร่แล้วน้อยกว่า {n(min)} ข้อ
        {ctx.isAdmin ? " (ผู้ดูแลระบบปรับตัวเลขนี้ได้ที่หน้า บทบาทและค่าตั้ง)" : ""}
      </p>
      <QuizNav current="dashboard" />

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="quiz-cards">
        {cards.map((card) => (
          <li
            key={card.testid}
            data-testid={card.testid}
            className={cn("rounded-xl border bg-card p-4", card.warn ? "border-amber-400 bg-amber-50" : "")}
          >
            <p className="text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {card.href ? (
                <Link href={card.href} className="underline underline-offset-4">
                  {card.value}
                </Link>
              ) : (
                card.value
              )}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-primary">จำนวนข้อสอบต่อรายวิชาและหน่วย</h2>
        <Button asChild variant="outline">
          <Link href={onlyLow ? "/app/quiz" : "/app/quiz?show=low"} scroll={false}>
            {onlyLow ? "แสดงทุกรายวิชา" : "แสดงเฉพาะที่ต้องเติมข้อสอบ"}
          </Link>
        </Button>
      </div>

      {COURSE_LEVELS.map((level) => {
        const list = courses
          .filter((c) => c.level === level)
          .filter((c) => !onlyLow || (c.has_mcq && (c.units.length === 0 || c.units.some((u) => u.published < min))));
        if (list.length === 0) return null;
        return (
          <div key={level} className="mt-5 overflow-x-auto rounded-xl border bg-card" data-testid={`bank-${level}`}>
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <caption className="border-b bg-secondary px-4 py-2 text-left text-lg font-bold text-primary">
                {COURSE_LEVEL_LABEL[level]}
              </caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="px-4 py-2">รายวิชา / หน่วยการเรียน</th>
                  <th scope="col" className="w-28 px-4 py-2 text-right">เผยแพร่</th>
                  <th scope="col" className="w-28 px-4 py-2 text-right">ร่าง</th>
                  <th scope="col" className="w-56 px-4 py-2">หมายเหตุ</th>
                </tr>
              </thead>
              {list.map((course) => {
                const units = onlyLow ? course.units.filter((u) => u.published < min) : course.units;
                return (
                  <tbody key={course.id} className="border-b last:border-b-0" data-course={course.code}>
                    <tr className="bg-muted/50">
                      <th scope="row" className="px-4 py-2 font-semibold">
                        <Link href={`/app/quiz/courses/${course.id}`} className="text-primary underline underline-offset-4">
                          {course.name}
                        </Link>
                      </th>
                      <td className="px-4 py-2 text-right font-semibold">{course.has_mcq ? n(course.published) : "-"}</td>
                      <td className="px-4 py-2 text-right font-semibold">{course.has_mcq ? n(course.draft) : "-"}</td>
                      <td className="px-4 py-2">
                        {!course.has_mcq ? (
                          <span className="text-muted-foreground">ข้อเขียน ไม่มีข้อสอบปรนัย</span>
                        ) : course.units.length === 0 ? (
                          <Warn>ยังไม่มีหน่วยการเรียน</Warn>
                        ) : null}
                      </td>
                    </tr>
                    {units.map((unit) => (
                      <tr key={unit.id} className="border-t" data-unit={unit.name}>
                        <td className="py-2 pr-4 pl-8">
                          {course.has_mcq ? (
                            <Link
                              href={`/app/quiz/questions?f_course=${course.id}&f_unit=${unit.id}`}
                              className="underline underline-offset-4"
                            >
                              {unit.name}
                            </Link>
                          ) : (
                            unit.name
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{course.has_mcq ? n(unit.published) : "-"}</td>
                        <td className="px-4 py-2 text-right">{course.has_mcq ? n(unit.draft) : "-"}</td>
                        <td className="px-4 py-2">
                          {course.has_mcq && unit.published < min ? (
                            <Warn>ขาดอีก {n(min - unit.published)} ข้อ</Warn>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        );
      })}
      {onlyLow && lowUnits.length === 0 && noUnit.length === 0 ? (
        <p className="mt-5 rounded-xl border bg-card p-5 text-muted-foreground">
          ทุกหน่วยมีข้อสอบเผยแพร่แล้วครบ {n(min)} ข้อขึ้นไป
        </p>
      ) : null}
    </section>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-900">
      <AlertTriangle className="size-4" aria-hidden />
      {children}
    </span>
  );
}
