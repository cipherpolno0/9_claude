import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { InfoText } from "@/components/form";
import { QuestionStatusBadge } from "@/components/question-status-badge";
import { HistoryList } from "@/components/record-history";
import { Button } from "@/components/ui/button";
import { requireQuizManager } from "@/lib/auth/guards";
import {
  CHOICE_LABEL,
  DIFFICULTY_LABEL,
  QUESTION_FIELD_LABEL,
  QUESTION_STATUS_LABEL,
  type ChoiceKey,
  type Difficulty,
  type QuestionStatus,
} from "@/lib/quiz";
import { fetchQuestion, fetchQuestionHistory } from "@/lib/quiz-server";
import { thaiDateTime } from "@/lib/thai";

import { FactRow } from "../../../personnel/person-facts";
import { QuestionPreview } from "../question-preview";
import { QuestionActions } from "./question-actions";

export const metadata: Metadata = { title: "ตัวอย่างข้อสอบ" };
export const dynamic = "force-dynamic";

function formatHistory(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field === "status") return QUESTION_STATUS_LABEL[value as QuestionStatus] ?? null;
  if (field === "difficulty") return DIFFICULTY_LABEL[value as Difficulty] ?? null;
  if (field === "correct_choice") return CHOICE_LABEL[value as ChoiceKey] ?? null;
  if (field === "is_active") return value ? "ใช้งาน" : "ปิดใช้งาน";
  if (field === "published_at") return thaiDateTime(String(value));
  if (field === "course_id" || field === "unit_id") return "(เปลี่ยนรายการ)";
  return null;
}

export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireQuizManager();
  const { id } = await params;
  const query = await searchParams;
  const question = await fetchQuestion(id);
  if (!question) notFound();
  const history = await fetchQuestionHistory(question.id);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/quiz/questions" className="text-primary underline underline-offset-4">
          ← จัดการข้อสอบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">ตัวอย่างข้อสอบ</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            {question.courses?.name} · {question.units?.name}
            <QuestionStatusBadge status={question.status} isActive={question.is_active} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/quiz/questions/${question.id}/edit`}>
              <Pencil aria-hidden />
              แก้ไข
            </Link>
          </Button>
          <QuestionActions questionId={question.id} status={question.status} isActive={question.is_active} />
        </div>
      </div>

      {query.saved ? (
        <div className="mt-4">
          <InfoText>
            บันทึกแล้ว{question.status === "draft" ? " ข้อนี้ยังเป็นฉบับร่าง ลองตอบในตัวอย่างด้านล่าง ถ้าถูกต้องแล้วกด เผยแพร่" : ""}
          </InfoText>
        </div>
      ) : null}

      <div className="mt-6">
        <QuestionPreview
          question={question.question_text}
          choices={{ a: question.choice_a, b: question.choice_b, c: question.choice_c, d: question.choice_d }}
          correct={question.correct_choice}
          explanation={question.explanation}
        />
      </div>

      <h2 className="mt-8 text-xl font-bold text-primary">ข้อมูลของผู้จัดการคลัง</h2>
      <dl className="mt-3 rounded-xl border bg-card px-5 py-2" data-testid="question-facts">
        <FactRow label="รายวิชา">{question.courses?.name ?? "-"}</FactRow>
        <FactRow label="หน่วยการเรียน">
          {question.units?.name ?? "-"}
          {question.units && !question.units.is_active ? " (ปิดใช้งาน)" : ""}
        </FactRow>
        <FactRow label="ข้อถูก">
          {CHOICE_LABEL[question.correct_choice]}. {question[`choice_${question.correct_choice}`]}
        </FactRow>
        <FactRow label="คำอธิบายเฉลย">
          <span className="whitespace-pre-line">{question.explanation || "-"}</span>
        </FactRow>
        <FactRow label="ที่มา">
          {question.source_year_be ? `ข้อสอบสนามหลวง พ.ศ. ${question.source_year_be}` : "ไม่ระบุปี"}
        </FactRow>
        <FactRow label="ระดับความยาก">{DIFFICULTY_LABEL[question.difficulty]}</FactRow>
        <FactRow label="สถานะ">
          {question.is_active ? QUESTION_STATUS_LABEL[question.status] : "ปิดใช้งาน"}
          {question.is_active && question.published_at ? ` เมื่อ ${thaiDateTime(question.published_at)}` : ""}
        </FactRow>
      </dl>

      <h2 className="mt-8 mb-3 text-xl font-bold text-primary">ประวัติการแก้ไข</h2>
      <HistoryList logs={history} labels={QUESTION_FIELD_LABEL} format={formatHistory} />
    </section>
  );
}
