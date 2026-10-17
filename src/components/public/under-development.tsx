import Link from "next/link";
import { Construction } from "lucide-react";

/**
 * หน้าที่ยังไม่เปิดใช้ (ช่วงที่ 2 บทที่ 33 สร้างเมนูและหน้าไว้ก่อน แต่ละหน้าจะทำจริงในบทของระบบนั้น)
 * เป็นหน้าคงที่ ห้ามอ่านฐานข้อมูล
 */
export function UnderDevelopment({
  title,
  description,
  back,
}: {
  title: string;
  description: string;
  back: { href: string; label: string };
}) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14" data-testid="under-development">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{description}</p>
      <div className="mt-8 flex items-start gap-3 rounded-xl border border-dashed bg-card p-5">
        <Construction className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
        <p className="text-lg">อยู่ระหว่างพัฒนา หน้านี้จะเปิดใช้เมื่อระบบส่วนนี้พร้อม</p>
      </div>
      <p className="mt-6">
        <Link href={back.href} className="font-semibold text-primary underline underline-offset-4">
          {back.label}
        </Link>
      </p>
    </section>
  );
}
