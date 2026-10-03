"use client";

import { createContext, useContext, useState } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { digits, type DigitMode } from "@/lib/thai";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * หน้าพิมพ์กลาง: กระดาษ A4 ฟอนต์ Sarabun มีหัวกระดาษ เลือกเลขไทยหรือเลขอารบิกได้
 *
 * ใช้:
 *   <PrintPage title="ชื่อเอกสาร" subtitle="...">
 *     <p>จำนวน <D>{count}</D> รูป</p>
 *   </PrintPage>
 * ตัวเลขที่ต้องสลับเลขไทย/อารบิก ให้ครอบด้วย <D>...</D> (หรือใช้ useDigits() ในชิ้นส่วนของตนเอง)
 */

const DigitContext = createContext<DigitMode>("arabic");

/** ฟังก์ชันแปลงตัวเลขตามแบบที่ผู้ใช้เลือกในหน้าพิมพ์ */
export function useDigits() {
  const mode = useContext(DigitContext);
  return (value: string | number) => digits(value, mode);
}

/** ครอบข้อความที่มีตัวเลข เพื่อให้สลับเลขไทย/อารบิกตามที่เลือก */
export function D({ children }: { children: string | number }) {
  const d = useDigits();
  return <>{d(children)}</>;
}

export function PrintPage({
  title,
  subtitle,
  unitName,
  defaultDigits = "thai",
  children,
}: {
  title: string;
  subtitle?: string;
  /** หน่วยงานเจ้าของเอกสาร (ค่าเริ่มต้น = ชื่อหน่วยงานของเว็บ) */
  unitName?: string;
  defaultDigits?: DigitMode;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<DigitMode>(defaultDigits);

  return (
    <DigitContext.Provider value={mode}>
      {/* แถบเครื่องมือ: ไม่ถูกพิมพ์ */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted px-4 py-3 print:hidden">
        <div role="group" aria-label="รูปแบบตัวเลข" className="flex rounded-md border border-input bg-background p-1">
          {(["thai", "arabic"] as DigitMode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-3 py-1.5 font-medium",
                mode === m ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {m === "thai" ? "เลขไทย ๑๒๓" : "เลขอารบิก 123"}
            </button>
          ))}
        </div>
        <Button type="button" onClick={() => window.print()}>
          <Printer aria-hidden />
          พิมพ์ / บันทึกเป็น PDF
        </Button>
        <p className="text-sm text-muted-foreground">ในหน้าต่างพิมพ์ เลือกขนาดกระดาษ A4 และปิด “หัวกระดาษและท้ายกระดาษ” ของเบราว์เซอร์</p>
      </div>

      {/* แผ่นกระดาษ A4 */}
      <div className="bg-muted px-2 py-6 print:bg-white print:p-0">
        <article
          data-testid="print-sheet"
          className="print-sheet mx-auto w-full max-w-[210mm] bg-white px-[20mm] py-[18mm] text-black shadow-md print:max-w-none print:p-0 print:shadow-none"
        >
          <header className="mb-6 border-b-2 border-black pb-3 text-center">
            <p className="text-lg font-bold">{unitName ?? site.shortName}</p>
            <h1 className="mt-1 text-xl font-bold">{title}</h1>
            {subtitle ? <p className="mt-1">{digits(subtitle, mode)}</p> : null}
          </header>
          <div className="leading-relaxed">{children}</div>
        </article>
      </div>
    </DigitContext.Provider>
  );
}
