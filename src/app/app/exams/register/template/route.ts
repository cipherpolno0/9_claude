import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { regionNoFromName, templateFileName } from "@/lib/exam-forms";
import { buildTemplateWorkbook } from "@/lib/exam-forms-excel";
import { activeTitles, fetchFormTemplate, fetchTemplateContext, fetchTitleOptions } from "@/lib/exam-forms-server";

/**
 * แม่แบบบัญชี ศ. ที่เติมหัวแฟ้มแล้ว (?round= &place= &venue=)
 * ฐานข้อมูลตรวจซ้ำทุกครั้ง: รอบเปิดรับสมัครและอยู่ในช่วงวัน สำนักอยู่ในเขตของผู้ใช้ สนามสอบเปิดอยู่และเปิดสอบชั้นนี้
 */
export async function GET(request: NextRequest) {
  await requireMenu("/app/exams");
  const p = request.nextUrl.searchParams;
  const result = await fetchTemplateContext(p.get("round") ?? "", p.get("place") ?? "", p.get("venue") ?? "");
  if (!result.ok) {
    return new Response(result.error, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const { context } = result;
  const [template, titles] = await Promise.all([fetchFormTemplate(context.template_id), fetchTitleOptions()]);
  if (!template) {
    return new Response("ไม่พบแบบฟอร์มบัญชี ศ. ของรอบนี้", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const workbook = await buildTemplateWorkbook(template, activeTitles(titles, template.exam_type), {
    year_be: context.year_be,
    venue_code: context.venue.code,
    venue_name: context.venue.name,
    venue_subdistrict: context.venue.subdistrict,
    venue_district: context.venue.district,
    venue_province: context.venue.province,
    region_no: regionNoFromName(context.venue.region_name),
  });
  return workbookResponse(workbook, templateFileName(template, [context.year_be, context.venue.name, context.place.name]));
}
