import type { Metadata } from "next";
import Link from "next/link";

import {
  DATA_FIRST_ROW,
  EXAM_TYPE_LABEL,
  HEADER_FIELD_LABEL,
  columnLetter,
  columnRuleText,
  examName,
  type FormTemplate,
} from "@/lib/exam-forms";
import { activeTitles, fetchPublicForms } from "@/lib/exam-forms-server";

import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "คู่มือการกรอกบัญชี ศ.",
  description: "วิธีกรอกแม่แบบ Excel บัญชีสำมะโนครัวผู้ขอเข้าสอบความรู้ นักธรรมและธรรมศึกษา",
};
export const revalidate = 300;

const cell = "border px-2 py-1.5 align-top";

function TemplateGuide({ t, titles }: { t: FormTemplate; titles: string[] }) {
  const headerFields = t.header_cells.filter((h) => h.field);
  return (
    <article className="mt-6 break-inside-avoid rounded-xl border bg-card p-5" id={`form-${t.id}`} data-testid="guide-template">
      <h2 className="text-xl font-bold text-primary">
        {t.code} {examName(t.exam_type, t.level)}
      </h2>
      <p className="text-muted-foreground">
        {t.title.replace(/\s+/g, " ")} · แผ่นงาน {t.sheet_name} · รุ่น {t.version || "-"}{" "}
        <a href={`/downloads/templates/${t.id}`} className="text-primary underline underline-offset-4 print:hidden">
          ดาวน์โหลดแม่แบบเปล่า
        </a>
      </p>
      <h3 className="mt-3 font-bold">หัวแฟ้ม (แถว 4-5)</h3>
      <ul className="mt-1 list-disc pl-6">
        {headerFields.map((h) => (
          <li key={h.cell}>
            {HEADER_FIELD_LABEL[h.field!]} (ช่อง {h.merge ?? h.cell})
            {h.help ? `: ${h.help}` : ""}
          </li>
        ))}
      </ul>
      <h3 className="mt-3 font-bold">ข้อมูลผู้สมัคร (เริ่มแถว {DATA_FIRST_ROW} แถวละ 1 คน)</h3>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead className="bg-muted">
            <tr>
              <th className={cell}>คอลัมน์</th>
              <th className={cell}>ชื่อคอลัมน์</th>
              <th className={cell}>บังคับกรอก</th>
              <th className={cell}>ชนิดและกฎตรวจ</th>
              <th className={cell}>คำแนะนำ</th>
            </tr>
          </thead>
          <tbody>
            {t.columns.map((c, i) => (
              <tr key={c.key}>
                <td className={`${cell} text-center font-mono`}>{columnLetter(i + 1)}</td>
                <td className={cell}>{c.label}</td>
                <td className={cell}>{c.required ? "บังคับ" : "ไม่บังคับ"}</td>
                <td className={cell}>{columnRuleText(c, titles)}</td>
                <td className={cell}>{[c.help, c.header_help].filter(Boolean).join(" / ") || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default async function FormGuidePage() {
  const { templates, titles } = await fetchPublicForms().catch(() => ({ templates: [], titles: [] }));
  const notice = templates[0]?.notice?.replace(/\s+/g, " ").trim();

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm print:hidden">
        <Link href="/downloads" className="text-primary underline underline-offset-4">
          ดาวน์โหลด
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">คู่มือการกรอกบัญชี ศ.</h1>
        <PrintButton />
      </div>
      <p className="mt-1 text-muted-foreground">
        บัญชีสำมะโนครัวผู้ขอเข้าสอบความรู้ในสนามหลวง {EXAM_TYPE_LABEL.nak_tham}และ{EXAM_TYPE_LABEL.tham_sueksa}{" "}
        คำแนะนำในหน้านี้มาจากข้อความในแบบฟอร์มของสำนักงานแม่กองธรรม
      </p>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ขั้นตอนการกรอก</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          {notice ? <li>{notice}</li> : null}
          <li>ใช้แม่แบบให้ตรงกับประเภทและชั้นที่สมัคร (แต่ละแฟ้มกำหนดชั้นไว้แล้ว)</li>
          <li>กรอกหัวแฟ้มในแถว 4-5 ให้ครบ: ปี พ.ศ. รหัสสนามสอบ ชื่อเต็มสนามสอบ ตำบล อำเภอ จังหวัด และเลขภาค (เลขอารบิก)</li>
          <li>กรอกข้อมูลผู้สมัครตั้งแต่แถว {DATA_FIRST_ROW} แถวละ 1 คน ห้ามใช้สูตร วันที่พิมพ์แบบ วัน/เดือน/ปี พ.ศ. เช่น 1/1/2540</li>
          <li>ชี้หรือคลิกที่ช่องในแม่แบบ จะมีคำแนะนำของช่องนั้นขึ้นมา ช่องที่มีรายการให้เลือกจะมีลูกศรให้เลือก</li>
          <li>แผ่นงาน ตัวอย่าง ในแม่แบบเป็นข้อมูลสมมุติไว้ดูวิธีกรอก ไม่ต้องแก้และไม่ใช่ข้อมูลที่ส่ง</li>
        </ol>
      </div>

      {templates.length === 0 ? (
        <p className="mt-6 text-muted-foreground">ยังไม่มีแบบฟอร์ม</p>
      ) : (
        templates.map((t) => <TemplateGuide key={t.id} t={t} titles={activeTitles(titles, t.exam_type)} />)
      )}
    </section>
  );
}
