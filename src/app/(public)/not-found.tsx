import Link from "next/link";

/** หน้าไม่พบของโซนสาธารณะ (เช่น เปิดรายการที่ไม่มีในทะเบียน หรือรายการที่ถูกปิดใช้งานแล้ว) */
export default function PublicNotFound() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:py-24">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ไม่พบหน้าที่ต้องการ</h1>
      <p className="mt-3 text-muted-foreground">
        รายการนี้อาจไม่มีในทะเบียน ถูกยกเลิกไปแล้ว หรือที่อยู่ของหน้าไม่ถูกต้อง
      </p>
      <p className="mt-6 flex flex-wrap justify-center gap-4">
        <Link href="/registry" className="text-primary underline underline-offset-4">
          ไปที่หน้า ทะเบียน
        </Link>
        <Link href="/" className="text-primary underline underline-offset-4">
          กลับหน้าแรก
        </Link>
      </p>
    </section>
  );
}
