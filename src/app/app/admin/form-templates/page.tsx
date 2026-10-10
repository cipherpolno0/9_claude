import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { fetchFormTemplates, fetchTitleOptions } from "@/lib/exam-forms-server";
import { fetchResultForms } from "@/lib/exam-results-server";

import { ResultFormsEditor } from "./result-forms-editor";
import { TemplateList, TitleOptionsManager } from "./template-list";

export const metadata: Metadata = { title: "แบบฟอร์มบัญชี ศ." };
export const dynamic = "force-dynamic";

export default async function FormTemplatesPage() {
  await requireAdmin();
  const [templates, titles, resultForms] = await Promise.all([fetchFormTemplates(), fetchTitleOptions(), fetchResultForms()]);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">แบบฟอร์มบัญชี ศ.</h1>
      <p className="mt-1 text-muted-foreground">
        แบบตั้งต้นอ่านจากไฟล์จริงของสำนักงานแม่กองธรรม ฉบับ 2568-v3 (ศ.๑ ศ.๒ ศ.๕ ศ.๖) ระบบสร้างแม่แบบ Excel จากค่าที่ตั้งในหน้านี้
        ทั้งหน้าดาวน์โหลดสาธารณะและหน้าสมัครสอบ แก้รายการคอลัมน์ ชนิดข้อมูล บังคับกรอก กฎตรวจ และคำแนะนำได้ที่ปุ่ม แก้ไข
        ถ้าแม่กองธรรมออกแบบรุ่นใหม่ ให้ คัดลอกเป็นแบบใหม่ แก้ให้ตรง แล้วปิดแบบเดิมและเปิดแบบใหม่
      </p>
      <TemplateList templates={templates} />
      <TitleOptionsManager options={titles} />
      <ResultFormsEditor forms={resultForms} />
    </section>
  );
}
