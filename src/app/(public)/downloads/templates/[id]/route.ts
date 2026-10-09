import type { NextRequest } from "next/server";

import { workbookResponse } from "@/lib/excel";
import { templateFileName } from "@/lib/exam-forms";
import { buildTemplateWorkbook } from "@/lib/exam-forms-excel";
import { activeTitles, fetchPublicForms } from "@/lib/exam-forms-server";

/** แม่แบบเปล่าของแบบที่ใช้งานอยู่ (หน้าสาธารณะ ไม่ต้องล็อกอิน ไม่มีข้อมูลบุคคล) */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { templates, titles } = await fetchPublicForms();
  const template = templates.find((t) => t.id === id);
  if (!template) {
    return new Response("ไม่พบแม่แบบนี้ หรือแม่แบบนี้เลิกใช้แล้ว", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const workbook = await buildTemplateWorkbook(template, activeTitles(titles, template.exam_type));
  return workbookResponse(workbook, templateFileName(template, ["แม่แบบเปล่า"]));
}
