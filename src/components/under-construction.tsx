import { Hammer } from "lucide-react";

/** หน้าว่างของเมนูที่ยังไม่ได้พัฒนา ใช้ซ้ำได้ทุกเมนู */
export function UnderConstruction({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{title}</h1>
      {description ? (
        <p className="mt-2 text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-input bg-secondary px-6 py-12 text-center">
        <Hammer className="size-10 text-ring" aria-hidden />
        <p className="text-xl font-semibold text-primary">อยู่ระหว่างพัฒนา</p>
        <p className="text-muted-foreground">
          หน้านี้จะเปิดใช้งานในบทเรียนถัดไป
        </p>
      </div>
    </section>
  );
}
