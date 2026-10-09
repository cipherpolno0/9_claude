import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/guards";
import { HEADER_FIELD_LABEL, templateLabel } from "@/lib/exam-forms";
import { fetchFormTemplate } from "@/lib/exam-forms-server";

import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "แก้ไขแบบฟอร์มบัญชี ศ." };
export const dynamic = "force-dynamic";

export default async function FormTemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const template = await fetchFormTemplate(id);
  if (!template) notFound();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/admin/form-templates" className="text-primary underline underline-offset-4">
          แบบฟอร์มบัญชี ศ.
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">แก้ไข {templateLabel(template)}</h1>
      <p className="mt-1 text-muted-foreground">
        {template.is_active ? "แบบนี้ใช้งานอยู่ บันทึกแล้วมีผลกับแม่แบบที่ดาวน์โหลดหลังจากนี้ทันที" : "แบบนี้ปิดใช้งานอยู่"}{" "}
        คอลัมน์เรียงจาก A ไปทางขวา หัวตารางมี 2 บรรทัด (แถว 7 และ 8 ของไฟล์) หัวบรรทัดบนรวมหลายคอลัมน์ได้
      </p>

      <details className="mt-4 rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">หัวแฟ้ม (แถว 4-5) ตามไฟล์จริง</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          ตำแหน่งช่องของหัวแฟ้มคงไว้ตามไฟล์จริง ช่องกรอกถูกเติมให้อัตโนมัติในหน้าสมัครสอบ
        </p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {template.header_cells.map((h) => (
            <li key={h.cell}>
              <span className="font-mono">{h.merge ?? h.cell}</span>{" "}
              {h.field ? `ช่องกรอก: ${HEADER_FIELD_LABEL[h.field]}` : `ป้าย: ${h.text}`}
              {h.min !== undefined ? ` (${h.min} ถึง ${h.max})` : ""}
            </li>
          ))}
        </ul>
      </details>

      <TemplateEditor template={template} />
    </section>
  );
}
