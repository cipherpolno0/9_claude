import { redirect } from "next/navigation";

// เมนู พัสดุ-ครุภัณฑ์ ย้ายไป /app/inventory ในบทที่ 25 (หน้านี้คงไว้ให้ลิงก์เดิมยังใช้ได้)
export default function AssetsPage() {
  redirect("/app/inventory");
}
