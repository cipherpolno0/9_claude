import { appEnvironment } from "@/lib/environment";

/** แถบเตือนบนสุดของทุกหน้าเมื่อเปิดชุดทดสอบ (บทที่ 32) กันผู้ใช้กรอกข้อมูลจริงผิดชุด */
export function EnvironmentBanner() {
  if (appEnvironment() !== "staging") return null;
  return (
    <div role="note" className="bg-gold px-4 py-1.5 text-center font-semibold text-gold-foreground print:hidden" data-testid="env-banner">
      ชุดทดสอบ: ข้อมูลในระบบนี้ไม่ใช่ข้อมูลจริง ห้ามกรอกข้อมูลส่วนบุคคลจริง
    </div>
  );
}
