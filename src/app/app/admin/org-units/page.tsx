import type { Metadata } from "next";

import { buildTree, type OrgUnit } from "@/lib/org-units";
import { getSupabaseEnv } from "@/lib/supabase/admin";

import { fetchOrgUnits } from "./actions";
import { OrgUnitManager } from "./org-unit-manager";

export const metadata: Metadata = { title: "เขตปกครอง" };
export const dynamic = "force-dynamic";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border-2 border-dashed border-input bg-secondary p-5">
      <p className="text-lg font-semibold text-primary">{title}</p>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

export default async function OrgUnitsPage() {
  const env = getSupabaseEnv();
  let units: OrgUnit[] = [];
  let loadError: string | null = null;

  if (env.missing.length === 0) {
    try {
      units = await fetchOrgUnits();
    } catch (error) {
      const e = error as { code?: string; message?: string };
      loadError =
        e.code === "PGRST205" || e.code === "42P01"
          ? "ยังไม่พบตาราง org_units ในฐานข้อมูล กรุณารันไฟล์ migration ทั้ง 3 ไฟล์ในโฟลเดอร์ supabase/migrations ก่อน"
          : `อ่านข้อมูลไม่ได้: ${e.message ?? "ไม่ทราบสาเหตุ"}`;
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">เขตปกครอง</h1>
      <p className="mt-1 text-muted-foreground">
        ส่วนกลาง &gt; ภาค &gt; จังหวัด &gt; อำเภอ &gt; ตำบล แยกตามนิกาย
      </p>

      {env.missing.length > 0 ? (
        <Notice title="ยังไม่ได้เชื่อมต่อฐานข้อมูล">
          <p>กรุณาสร้างไฟล์ .env.local (คัดลอกจาก .env.example) แล้วเติมค่าต่อไปนี้ จากนั้นปิดแล้วเปิด npm run dev ใหม่</p>
          <ul className="list-disc pl-6">
            {env.missing.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </Notice>
      ) : loadError ? (
        <Notice title="เชื่อมต่อได้ แต่อ่านข้อมูลไม่สำเร็จ">
          <p>{loadError}</p>
        </Notice>
      ) : (
        <OrgUnitManager tree={buildTree(units)} total={units.length} />
      )}
    </section>
  );
}
