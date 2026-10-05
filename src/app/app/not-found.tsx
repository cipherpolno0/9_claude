import Link from "next/link";

/** หน้าไม่พบของพื้นที่ทำงาน (เช่น เปิดรายการที่ไม่มี หรือรายการที่ท่านไม่มีสิทธิ์ดู) */
export default function WorkspaceNotFound() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:py-24">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ไม่พบหน้าที่ต้องการ</h1>
      <p className="mt-3 text-muted-foreground">
        รายการนี้อาจไม่มีในระบบ ท่านอาจไม่มีสิทธิ์ดู หรือที่อยู่ของหน้าไม่ถูกต้อง
      </p>
      <p className="mt-6">
        <Link href="/app" className="text-primary underline underline-offset-4">
          กลับไปแดชบอร์ด
        </Link>
      </p>
    </section>
  );
}
