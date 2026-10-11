import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { ACCESS_ACTION_LABEL, ACCESS_SUBJECT_LABEL, ACCESS_SUBJECT_TYPES, type AccessSubjectType } from "@/lib/privacy";
import { fetchAccessLogs } from "@/lib/privacy-server";
import { createClient } from "@/lib/supabase/server";
import { thaiDateTime } from "@/lib/thai";

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** ส่งออกบันทึกการเข้าดูข้อมูลบุคคลตามตัวกรอง (ผู้ดูแลระบบ ไม่เกิน 5,000 แถว) */
export async function GET(request: NextRequest) {
  await requireAdmin();
  const sp = request.nextUrl.searchParams;
  const type = (ACCESS_SUBJECT_TYPES as readonly string[]).includes(sp.get("type") ?? "") ? (sp.get("type") as string) : "";
  const email = (sp.get("email") ?? "").trim().toLowerCase();
  let viewer: string | null = null;
  if (email) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    viewer = (data?.id as string | undefined) ?? "00000000-0000-0000-0000-000000000000";
  }
  const { rows } = await fetchAccessLogs(
    { viewer, type, subject: (sp.get("subject") ?? "").slice(0, 100), from: isoDate(sp.get("from")), to: isoDate(sp.get("to")) },
    5000,
    0,
  );
  return xlsxResponse(
    "บันทึกการเข้าดูข้อมูลบุคคล.xlsx",
    "บันทึกการเข้าดู",
    [
      { header: "วันเวลา", width: 22 },
      { header: "ผู้เข้าดู", width: 30 },
      { header: "อีเมล", width: 30 },
      { header: "การกระทำ", width: 12 },
      { header: "ชนิดข้อมูล", width: 22 },
      { header: "เจ้าของข้อมูล / รายการ", width: 30 },
      { header: "รหัสรายการ", width: 38 },
      { header: "รายละเอียด", width: 40 },
    ],
    rows.map((r) => [
      thaiDateTime(r.created_at),
      r.viewer_name,
      r.viewer_email,
      ACCESS_ACTION_LABEL[r.action],
      ACCESS_SUBJECT_LABEL[r.subject_type as AccessSubjectType] ?? r.subject_type,
      r.subject_name ?? "",
      r.subject_id,
      r.detail,
    ]),
  );
}
