"use client";

import { PrintPage, useDigits } from "@/components/print/print-page";
import type { ExamType } from "@/lib/exam-forms";
import type { PassSection, ResultForm } from "@/lib/exam-results";

import { PassListSheet } from "../pass-list";

function Sheets(props: { sections: PassSection[]; form: ResultForm | null; type: ExamType; year: number; announcedOn: string | null; draft: boolean }) {
  const d = useDigits();
  return (
    <>
      {props.sections.map((s, i) => (
        <section key={s.key} className={i > 0 ? "mt-10 break-before-page print:mt-0 print:pt-2" : ""} data-testid="print-pass">
          <PassListSheet section={s} form={props.form} type={props.type} year={props.year} announcedOn={props.announcedOn} draft={props.draft} d={d} print />
        </section>
      ))}
    </>
  );
}

export function PassPrintSheet({
  sections,
  form,
  type,
  year,
  announcedOn,
  draft,
  backHref,
}: {
  sections: PassSection[];
  form: ResultForm | null;
  type: ExamType;
  year: number;
  announcedOn: string | null;
  draft: boolean;
  backHref: string;
}) {
  return (
    <PrintPage title={`บัญชีผู้สอบได้ ${form?.code ?? ""} ปี ${year}`} showHeader={false}>
      <p className="mb-3 text-sm print:hidden">
        <a href={backHref} className="text-primary underline underline-offset-4">
          ← กลับหน้าบัญชีผู้สอบได้
        </a>
        {" · ตราสัญลักษณ์และลายมือชื่อจริงไม่ได้พิมพ์จากระบบ"}
      </p>
      {sections.length === 0 ? (
        <p>ไม่มีรายชื่อตามเงื่อนไขนี้</p>
      ) : (
        <Sheets sections={sections} form={form} type={type} year={year} announcedOn={announcedOn} draft={draft} />
      )}
    </PrintPage>
  );
}
