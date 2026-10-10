import type { Metadata } from "next";
import Link from "next/link";

import { fetchCountRows } from "@/lib/assets-server";
import { fetchInventoryEditUnits } from "@/lib/inventory-server";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { currentFiscalYear } from "../assets/scope";
import { InventoryNav, NoAccess } from "../ui";
import { CountCreateForm } from "./count-forms";
import { requireMenu } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "ตรวจนับครุภัณฑ์" };
export const dynamic = "force-dynamic";

export default async function CountsPage() {
  const ctx = await requireMenu("/app/inventory");
  const [rows, units] = ctx.canViewInventory
    ? await Promise.all([fetchCountRows(), ctx.canEditInventory ? fetchInventoryEditUnits() : Promise.resolve([])])
    : [[], []];
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ตรวจนับครุภัณฑ์ประจำปี</h1>
      <InventoryNav current="/app/inventory/counts" />
      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : (
        <>
          <p className="mt-4 text-muted-foreground">
            ขั้นตอน: เปิดรอบ &gt; ใช้กล้องมือถือสแกนป้าย QR ของครุภัณฑ์ หน้าครุภัณฑ์จะมีปุ่ม พบ / ชำรุด ของรอบที่เปิดอยู่ &gt; ปิดรอบ (ที่ยังไม่ตรวจ = ไม่พบ) &gt; ดูสรุปผลต่าง
          </p>
          {rows.length === 0 ? (
            <p className="mt-4 text-muted-foreground">ยังไม่มีรอบตรวจนับ</p>
          ) : (
            <ul className="mt-4 grid gap-2 md:grid-cols-2" data-testid="count-list">
              {rows.map((c) => (
                <li key={c.id} className={cn("rounded-lg border bg-card p-3", c.status === "open" && "border-2 border-ring")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/app/inventory/counts/${c.id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                      {c.title}
                    </Link>
                    <span className="text-sm">{c.status === "open" ? "กำลังตรวจนับ" : "ปิดรอบแล้ว"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {c.unit_name}
                    {c.include_sub ? " (รวมใต้สังกัด)" : ""} · เริ่ม {thaiDate(c.started_on, "short")}
                  </p>
                  <p className="text-sm">
                    ต้องตรวจ {c.total} · พบ {c.found} · ชำรุด {c.damaged} · ไม่พบ {c.missing}
                    {c.unchecked ? ` · ยังไม่ตรวจ ${c.unchecked}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {ctx.canEditInventory && units.some((u) => u.selectable) ? (
            <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="mb-3 text-xl font-bold text-primary">เปิดรอบตรวจนับใหม่</h2>
              <CountCreateForm units={units} defaultTitle={`ตรวจนับครุภัณฑ์ประจำปีงบประมาณ ${currentFiscalYear()}`} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
