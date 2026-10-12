import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { IMPORT_STEPS } from "@/lib/data-import";
import { appEnvironment } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

import { DataImportButton } from "./import-buttons";

export const metadata: Metadata = { title: "นำเข้าข้อมูลจริง" };
export const dynamic = "force-dynamic";

type Filter = ["eq", string, string | boolean] | ["like", string, string];

async function counts() {
  const supabase = await createClient();
  const count = async (table: string, ...filters: Filter[]) => {
    // นับด้วยคอลัมน์เดียว (persons มีคอลัมน์ที่เปิดให้อ่านไม่ได้ ห้าม select *)
    let q = supabase.from(table).select(table.startsWith("civil_") ? "code" : "id", { count: "exact", head: true });
    for (const [op, col, value] of filters) q = op === "eq" ? q.eq(col, value) : q.like(col, value as string);
    const { count: total } = await q;
    return total ?? 0;
  };
  const [units, testUnits, provinces, subdistricts, places, temples, persons, appointments, venues, users, testUsers] =
    await Promise.all([
      count("org_units", ["eq", "is_active", true]),
      count("org_units", ["like", "code", "TEST%"]),
      count("civil_provinces"),
      count("civil_subdistricts"),
      count("places", ["eq", "is_active", true]),
      count("places", ["eq", "is_active", true], ["eq", "place_type", "temple"]),
      count("persons", ["eq", "is_active", true]),
      count("appointments", ["eq", "is_active", true]),
      count("exam_venues", ["eq", "is_active", true]),
      count("profiles", ["eq", "status", "active"]),
      count("profiles", ["like", "email", "test.%@example.com"]),
    ]);
  return { units, testUnits, provinces, subdistricts, places, temples, persons, appointments, venues, users, testUsers };
}

function n(v: number) {
  return v.toLocaleString("th-TH");
}

export default async function DataImportPage() {
  await requireAdmin();
  const c = await counts();
  const env = appEnvironment();

  const step = {
    units: {
      done: c.units > 0 && c.subdistricts > 0,
      summary: `เขตปกครองคณะสงฆ์ ${n(c.units)} หน่วย · จังหวัด ${n(c.provinces)} ตำบล ${n(c.subdistricts)}`,
      actions: (
        <>
          <Button asChild variant="outline">
            <Link href="/app/admin/org-units">ไปหน้า เขตปกครอง (นำเข้า Excel)</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/admin/civil-areas">ไปหน้า เขตการปกครองบ้านเมือง</Link>
          </Button>
        </>
      ),
    },
    places: {
      done: c.places > 0,
      summary: `สถานที่ ${n(c.places)} แห่ง (วัด ${n(c.temples)})`,
      actions: (
        <Button asChild variant="outline">
          <Link href="/app/places">ไปหน้า ทะเบียนสถานที่ (นำเข้าทีละประเภท)</Link>
        </Button>
      ),
    },
    persons: {
      done: c.persons > 0 && c.appointments > 0,
      summary: `บุคคล ${n(c.persons)} · ตำแหน่งที่บันทึก ${n(c.appointments)} วาระ`,
      actions: (
        <>
          <Button asChild variant="outline">
            <Link href="/app/personnel">ไปหน้า บุคลากร (นำเข้าบุคคล)</Link>
          </Button>
          <DataImportButton kind="appointments" />
          <Button asChild variant="outline">
            <a href="/app/admin/data-import/template?kind=appointments">
              <Download aria-hidden />
              แม่แบบตำแหน่ง
            </a>
          </Button>
        </>
      ),
    },
    venues: {
      done: c.venues > 0,
      summary: `สนามสอบ ${n(c.venues)} สนาม`,
      actions: (
        <>
          <DataImportButton kind="venues" />
          <Button asChild variant="outline">
            <a href="/app/admin/data-import/template?kind=venues">
              <Download aria-hidden />
              แม่แบบสนามสอบ
            </a>
          </Button>
        </>
      ),
    },
    users: {
      done: c.users - c.testUsers > 1,
      summary: `บัญชีที่ใช้งาน ${n(c.users)} บัญชี`,
      actions: (
        <>
          <DataImportButton kind="users" />
          <Button asChild variant="outline">
            <a href="/app/admin/data-import/template?kind=users">
              <Download aria-hidden />
              แม่แบบผู้ใช้
            </a>
          </Button>
        </>
      ),
    },
  } as const;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">นำเข้าข้อมูลจริง</h1>
      <p className="mt-1 text-muted-foreground">
        นำเข้าตามลำดับขั้น 1 ถึง 5 เพราะข้อมูลขั้นหลังอ้างถึงข้อมูลขั้นก่อน ทุกขั้นตรวจทั้งไฟล์ก่อนบันทึก ผิดแถวเดียวไม่บันทึกทั้งชุด
        และดาวน์โหลดรายงานแถวที่ผิดเป็น Excel ได้
      </p>

      {env === "production" && (c.testUnits > 0 || c.testUsers > 0) ? (
        <p role="status" className="mt-4 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3 font-medium" data-testid="test-data-warning">
          ระบบนี้เป็นชุดใช้งานจริง แต่ยังมีข้อมูลทดสอบ (หน่วย TEST {n(c.testUnits)} หน่วย บัญชีทดสอบ {n(c.testUsers)} บัญชี)
          ให้ล้างตามคู่มือ docs/ops/ขึ้นใช้งานจริง.md ก่อนนำเข้าข้อมูลจริง
        </p>
      ) : null}

      <ol className="mt-6 flex flex-col gap-4" data-testid="import-steps">
        {IMPORT_STEPS.map((s, i) => {
          const info = step[s.key];
          return (
            <li key={s.key} className="rounded-xl border bg-card p-4 sm:p-5" data-testid={`step-${s.key}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <h2 className="text-lg font-semibold">{s.title}</h2>
                <span
                  className={
                    info.done
                      ? "rounded-full bg-accent px-2 py-0.5 text-sm font-medium text-accent-foreground"
                      : "rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground"
                  }
                >
                  {info.done ? "มีข้อมูลแล้ว" : "ยังไม่มีข้อมูล"}
                </span>
              </div>
              <p className="mt-2 text-muted-foreground">{s.detail}</p>
              <p className="mt-1 font-medium" data-testid={`step-${s.key}-summary`}>
                {info.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">{info.actions}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
