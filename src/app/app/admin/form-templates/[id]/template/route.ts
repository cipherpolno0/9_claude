import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { templateFileName } from "@/lib/exam-forms";
import { buildTemplateWorkbook } from "@/lib/exam-forms-excel";
import { activeTitles, fetchFormTemplate, fetchTitleOptions } from "@/lib/exam-forms-server";

/** แม่แบบเปล่าของแบบฟอร์ม (รวมแบบที่ปิดใช้งาน) ให้ผู้ดูแลระบบตรวจก่อนเปิดใช้งาน */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [template, titles] = await Promise.all([fetchFormTemplate(id), fetchTitleOptions()]);
  if (!template) return new Response("ไม่พบแบบฟอร์มนี้", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const workbook = await buildTemplateWorkbook(template, activeTitles(titles, template.exam_type));
  return workbookResponse(workbook, templateFileName(template, ["แม่แบบเปล่า", template.version]));
}
