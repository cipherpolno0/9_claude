import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { fetchDocumentTypes } from "@/lib/place-requests-server";

import { DocumentTypeManager } from "./document-type-manager";

export const metadata: Metadata = { title: "รายการเอกสารของคำขอ" };
export const dynamic = "force-dynamic";

export default async function RequestDocumentsPage() {
  await requireAdmin();
  const types = await fetchDocumentTypes();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">รายการเอกสารของคำขอ</h1>
      <p className="mt-1 text-muted-foreground">
        กำหนดเอกสารที่ผู้ยื่นต้องแนบกับคำขอจัดตั้งและยุบสำนักเรียน สำนักศาสนศึกษา และคำขอเปิด ปิด ย้ายสนามสอบ ตามระเบียบ รายการที่ติ๊ก ต้องแนบ
        ผู้พิจารณาจะเห็นชอบไม่ได้จนกว่าผู้ยื่นจะแนบครบ รายการที่เลิกใช้ให้ปิดใช้งาน (ไม่ลบ) ไฟล์ที่แนบไว้กับคำขอเดิมยังคงอยู่
      </p>
      <DocumentTypeManager types={types} />
    </section>
  );
}
