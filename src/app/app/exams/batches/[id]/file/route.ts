import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { fetchBatch } from "@/lib/exam-batches-server";
import { createClient } from "@/lib/supabase/server";

const notFoundText = (text: string, status = 404) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * ไฟล์ Excel ต้นฉบับของบัญชี (?no= ลำดับไฟล์เพิ่มเติม ไม่ระบุ = ไฟล์แรก)
 * ลิงก์ดาวน์โหลดชั่วคราว 5 นาที เฉพาะผู้ที่เห็นบัญชีนี้ (RLS ของที่เก็บไฟล์ตรวจซ้ำ)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/exams");
  const { id } = await params;
  const batch = await fetchBatch(id);
  if (!batch) return notFoundText("ไม่พบไฟล์");
  const no = Number(request.nextUrl.searchParams.get("no") ?? "1");

  const supabase = await createClient();
  let path: string | null = null;
  let name = batch.file_name || "registration.xlsx";
  if (!Number.isInteger(no) || no <= 1) {
    const { data: row } = await supabase.from("registration_batches").select("file_path").eq("id", batch.id).maybeSingle();
    path = row?.file_path || null;
  } else {
    const { data: row } = await supabase
      .from("registration_files")
      .select("file_path, file_name")
      .eq("batch_id", batch.id)
      .eq("file_no", no)
      .maybeSingle();
    path = row?.file_path || null;
    name = row?.file_name || name;
  }
  if (!path) return notFoundText("ไม่พบไฟล์");
  const { data, error } = await supabase.storage.from("registration-files").createSignedUrl(path, 300, { download: name });
  if (error || !data) return notFoundText("สร้างลิงก์ดาวน์โหลดไม่ได้", 500);
  redirect(data.signedUrl);
}
