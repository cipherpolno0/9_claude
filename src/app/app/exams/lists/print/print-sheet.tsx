"use client";

import { D, PrintPage, useDigits } from "@/components/print/print-page";
import { templateLabel } from "@/lib/exam-forms";
import type { ListForm, VenueSection } from "@/lib/exam-lists";

import { SignatureBlock, VenueHeader, VenueTable } from "../form-list";

function Sections({ form, year, sections }: { form: ListForm; year: number; sections: VenueSection[] }) {
  const d = useDigits();
  return (
    <>
      {sections.map((s, i) => (
        <section key={s.venue_id} className={i > 0 ? "mt-10 break-before-page print:mt-0 print:pt-2" : ""} data-testid="print-venue">
          <VenueHeader form={form} section={s} year={year} d={d} />
          <VenueTable form={form} section={s} d={d} dense />
          <p className="mt-2 text-sm">
            รวมผู้ขอเข้าสอบ <D>{s.rows.length}</D> รูป/คน
            {s.places.length > 1 ? (
              <>
                {" "}
                จาก <D>{s.places.length}</D> สำนัก
              </>
            ) : null}
          </p>
          <SignatureBlock form={form} d={d} />
        </section>
      ))}
    </>
  );
}

export function ListPrintSheet({
  form,
  year,
  sections,
  backHref,
}: {
  form: ListForm;
  year: number;
  sections: VenueSection[];
  backHref: string;
}) {
  return (
    <PrintPage title={`${templateLabel(form)} ปี ${year}`} orientation="landscape" showHeader={false}>
      <p className="mb-3 text-sm print:hidden">
        <a href={backHref} className="text-primary underline underline-offset-4">
          ← กลับหน้าตรวจรายชื่อ
        </a>
        {form.signatures.length === 0 ? " · แบบนี้ยังไม่มีช่องลงนาม (ผู้ดูแลระบบตั้งได้ที่หน้า แบบฟอร์มบัญชี ศ.)" : ""}
      </p>
      {sections.length === 0 ? <p>ไม่มีรายชื่อตามเงื่อนไขนี้</p> : <Sections form={form} year={year} sections={sections} />}
    </PrintPage>
  );
}
