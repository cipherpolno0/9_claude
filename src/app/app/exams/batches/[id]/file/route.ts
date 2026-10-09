import { redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchBatch } from "@/lib/exam-batches-server";
import { createClient } from "@/lib/supabase/server";

/** ไฟล์ Excel ต้นฉบับของชุด: ลิงก์ดาวน์โหลดชั่วคราว 5 นาที เฉพาะผู้ที่เห็นชุดนี้ (RLS ของที่เก็บไฟล์ตรวจซ้ำ) */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/exams");
  const { id } = await params;
  const batch = await fetchBatch(id);
  if (!batch?.has_file) return new Response("ไม่พบไฟล์", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const supabase = await createClient();
  const { data: row } = await supabase.from("registration_batches").select("file_path").eq("id", batch.id).maybeSingle();
  if (!row?.file_path) return new Response("ไม่พบไฟล์", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const { data, error } = await supabase.storage
    .from("registration-files")
    .createSignedUrl(row.file_path, 300, { download: batch.file_name || "registration.xlsx" });
  if (error || !data) return new Response("สร้างลิงก์ดาวน์โหลดไม่ได้", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  redirect(data.signedUrl);
}
