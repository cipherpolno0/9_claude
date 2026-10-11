import type { Metadata } from "next";
import Link from "next/link";

import { Attachments } from "@/components/attachments";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { Button } from "@/components/ui/button";
import { fetchEmblemUrl, fetchLetterhead } from "@/lib/docs-server";
import { fetchAllActiveUnits } from "@/lib/org-units-server";

import { LetterheadForm } from "../doc-forms";
import { docsQuery, loadDocsScope } from "../scope";
import { DocsNoAccess, DocsUnitSelect } from "../ui";

export const metadata: Metadata = { title: "ตั้งค่าหัวหนังสือ" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

/** หัวหนังสือของหน่วย: รหัสหนังสือ ชื่อส่วนงาน ที่ตั้ง และตรา (ผู้ลงทะเบียนของหน่วย หรือผู้ดูแลระบบทุกหน่วย) */
export default async function DocsSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx, units } = await loadDocsScope(search);
  const editable = units.filter((u) => u.can_edit);
  const want = one(search.unit);
  const allUnits = ctx.isAdmin ? await fetchAllActiveUnits() : [];
  const unit = ctx.isAdmin
    ? (allUnits.find((u) => u.id === want) ?? null)
    : (editable.find((u) => u.id === want) ?? editable[0] ?? null);
  const central = allUnits.find((u) => u.level === "central") ?? null;
  const [letterhead, emblemUrl] = unit ? await Promise.all([fetchLetterhead(unit.id), fetchEmblemUrl(unit.id)]) : [null, null];

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/docs?${docsQuery(unit && !ctx.isAdmin ? unit.id : null)}`} className="text-primary underline underline-offset-4">
          ← สารบรรณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ตั้งค่าหัวหนังสือ</h1>
      {!ctx.isAdmin && editable.length === 0 ? (
        <DocsNoAccess isAdmin={false} />
      ) : (
        <>
          {ctx.isAdmin ? (
            <form method="get" action="/app/docs/settings" className="mt-4 flex flex-col gap-3 rounded-xl border bg-card p-4" data-testid="admin-unit-pick">
              <p className="font-semibold">เลือกหน่วย (ผู้ดูแลระบบตั้งได้ทุกหน่วย)</p>
              <OrgUnitPicker units={allUnits} name="unit" defaultValue={unit?.id ?? null} autoSelect={false} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline">
                  เปิดค่าตั้งของหน่วยนี้
                </Button>
                {central ? (
                  <Button asChild variant="outline">
                    <Link href={`/app/docs/settings?${docsQuery(central.id)}`}>ส่วนกลาง</Link>
                  </Button>
                ) : null}
              </div>
            </form>
          ) : (
            <DocsUnitSelect units={editable} value={unit?.id ?? ""} action="/app/docs/settings" />
          )}
          {unit ? (
            <>
              <p className="mt-4 text-lg font-semibold" data-testid="settings-unit">
                {unit.name}
              </p>
              <div className="mt-3 rounded-xl border bg-card p-5">
                <LetterheadForm key={unit.id} unitId={unit.id} initial={letterhead} />
              </div>
              <div className="mt-6 rounded-xl border bg-card p-5" data-testid="emblem">
                <h2 className="text-lg font-bold text-primary">ตราของหน่วย</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  รูป PNG หรือ JPG พื้นหลังโปร่งหรือขาว หน้าพิมพ์ใช้รูปที่แนบล่าสุด (ไม่แนบ = หนังสือไม่มีตรา)
                </p>
                {emblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวของไฟล์แนบ
                  <img src={emblemUrl} alt="ตราปัจจุบัน" className="mt-3 h-24 w-auto rounded border bg-white p-1" />
                ) : null}
                <div className="mt-3">
                  <Attachments
                    entityTable="doc_unit_settings"
                    entityId={unit.id}
                    orgUnitId={unit.id}
                    currentUserId={ctx.user.id}
                    refreshOnChange
                    emptyText="ยังไม่มีตรา"
                    inputLabel="เลือกรูปตรา"
                  />
                </div>
              </div>
            </>
          ) : ctx.isAdmin ? (
            <p className="mt-4 text-muted-foreground">เลือกหน่วยแล้วกด เปิดค่าตั้งของหน่วยนี้</p>
          ) : null}
        </>
      )}
    </section>
  );
}
