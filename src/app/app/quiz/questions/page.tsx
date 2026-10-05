import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { QuestionStatusBadge } from "@/components/question-status-badge";
import { Button } from "@/components/ui/button";
import { requireQuizManager } from "@/lib/auth/guards";
import { explainError } from "@/lib/errors";
import { CHOICE_LABEL, DIFFICULTIES, DIFFICULTY_LABEL, QUESTION_STATUSES, QUESTION_STATUS_LABEL } from "@/lib/quiz";
import { fetchCourses, fetchQuestionYears, fetchUnits, questionsTableParams, queryQuestions } from "@/lib/quiz-server";
import { thaiDate } from "@/lib/thai";

import { QuizNav } from "../quiz-nav";
import { QuestionImportButton } from "./import-button";
import { PublishDraftsButton } from "./publish-button";

export const metadata: Metadata = { title: "จัดการข้อสอบ" };
export const dynamic = "force-dynamic";

const short = (text: string, max = 110) => (text.length > max ? `${text.slice(0, max)}…` : text);

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireQuizManager();
  const params = questionsTableParams(await searchParams);
  const courseId = params.filters.course ?? "";
  const [table, courses, years, units] = await Promise.all([
    queryQuestions(params),
    fetchCourses(),
    fetchQuestionYears(),
    courseId ? fetchUnits(courseId) : Promise.resolve([]),
  ]);
  const mcqCourses = courses.filter((c) => c.has_mcq);

  const rows: DataTableRow[] = table.rows.map((q) => ({
    id: q.id,
    cells: [
      <Link key="q" href={`/app/quiz/questions/${q.id}`} className="font-semibold text-primary underline underline-offset-4">
        {short(q.question_text)}
      </Link>,
      <div key="course">
        {q.course_name}
        <span className="block text-sm text-muted-foreground">{q.unit_name}</span>
      </div>,
      CHOICE_LABEL[q.correct_choice] ?? "-",
      q.source_year_be ?? "-",
      DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty,
      <QuestionStatusBadge key="status" status={q.status} isActive={q.is_active} />,
      thaiDate(q.created_at),
    ],
  }));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">จัดการข้อสอบ</h1>
          <p className="mt-1 text-muted-foreground">
            ข้อสอบปรนัย 4 ตัวเลือกของคลัง กดที่โจทย์เพื่อดูตัวอย่างก่อนเผยแพร่ ข้อที่เพิ่มหรือนำเข้าใหม่เป็นฉบับร่างเสมอ
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/app/quiz/questions/template" download>
              ดาวน์โหลดแม่แบบ Excel
            </a>
          </Button>
          <QuestionImportButton />
          <PublishDraftsButton q={params.q} filters={params.filters} />
          <Button asChild>
            <Link href={`/app/quiz/questions/new${courseId ? `?course=${courseId}${params.filters.unit ? `&unit=${params.filters.unit}` : ""}` : ""}`}>
              <Plus aria-hidden />
              เพิ่มข้อสอบ
            </Link>
          </Button>
        </div>
      </div>
      <QuizNav current="questions" />

      <div className="mt-4 flex flex-col gap-4">
        {table.error ? <ErrorText>{explainError(table.error)}</ErrorText> : null}
        <DataTable
          columns={[
            { key: "question", header: "โจทย์" },
            { key: "course", header: "รายวิชา / หน่วย", sortable: true },
            { key: "correct", header: "ข้อถูก" },
            { key: "year", header: "ปี", sortable: true },
            { key: "difficulty", header: "ความยาก" },
            { key: "status", header: "สถานะ", sortable: true },
            { key: "created", header: "วันที่เพิ่ม", sortable: true },
          ]}
          rows={rows}
          total={table.total}
          page={params.page}
          pageSize={params.pageSize}
          sort={params.sort}
          dir={params.dir}
          q={params.q}
          searchPlaceholder="ค้นหาคำในโจทย์หรือตัวเลือก"
          filters={[
            {
              name: "course",
              label: "รายวิชา",
              options: mcqCourses.map((c) => ({ value: c.id, label: c.name })),
              clears: ["unit"],
            },
            ...(courseId
              ? [
                  {
                    name: "unit",
                    label: "หน่วย",
                    options: units.map((u) => ({ value: u.id, label: u.is_active ? u.name : `${u.name} (ปิดใช้งาน)` })),
                  },
                ]
              : []),
            {
              name: "year",
              label: "ปี",
              options: [...years.map((y) => ({ value: String(y), label: `พ.ศ. ${y}` })), { value: "none", label: "ไม่ระบุปี" }],
            },
            {
              name: "status",
              label: "สถานะ",
              options: [
                ...QUESTION_STATUSES.map((s) => ({ value: s as string, label: QUESTION_STATUS_LABEL[s] })),
                { value: "inactive", label: "ปิดใช้งาน" },
              ],
            },
            {
              name: "difficulty",
              label: "ความยาก",
              options: DIFFICULTIES.map((d) => ({ value: d as string, label: DIFFICULTY_LABEL[d] })),
            },
          ]}
          filterValues={params.filters}
          emptyText="ไม่พบข้อสอบตามเงื่อนไขนี้"
        />
      </div>
    </section>
  );
}
