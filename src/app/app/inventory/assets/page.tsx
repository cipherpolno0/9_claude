import type { Metadata } from "next";
import Link from "next/link";

import { selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONDITION_LABEL, type AssetCondition } from "@/lib/assets";
import { fetchAssetRows, fetchAssetTransfers, fetchAssetTypes } from "@/lib/assets-server";
import { baht } from "@/lib/budget";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { UnitFilter } from "../../personnel/unit-filter";
import { ConditionBadge, InventoryNav, NoAccess } from "../ui";
import { assetQuery, loadAssetScope } from "./scope";

export const metadata: Metadata = { title: "ทะเบียนครุภัณฑ์" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

/** ทะเบียนครุภัณฑ์ของหน่วย (รวมหน่วยใต้สังกัดได้) ค้นหา กรองประเภทและสภาพ การโอนที่รอรับ */
export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx, units, unit, sub } = await loadAssetScope(search);
  const q = one(search.q).trim().toLowerCase();
  const type = one(search.type);
  const cond = one(search.cond);
  const [all, types, transfers] = unit
    ? await Promise.all([fetchAssetRows(unit.id, sub), fetchAssetTypes({ includeInactive: true }), fetchAssetTransfers()])
    : [[], [], []];
  const rows = all.filter(
    (a) =>
      (!q || [a.asset_no, a.name, a.brand, a.model, a.serial_no, a.location, a.custodian].some((v) => v.toLowerCase().includes(q))) &&
      (!type || a.type_id === type) &&
      (!cond || a.condition === cond),
  );
  const incoming = transfers.filter((t) => t.can_receive);
  const outgoing = transfers.filter((t) => !t.can_receive);
  const base = assetQuery(unit, { sub: sub ? null : "0" });
  const filterQuery = assetQuery(unit, { sub: sub ? null : "0", q: one(search.q), type, cond });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ทะเบียนครุภัณฑ์</h1>
      <InventoryNav current="/app/inventory/assets" />
      {!ctx.canViewInventory || !unit ? (
        <NoAccess />
      ) : (
        <>
          {incoming.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950" data-testid="incoming-assets">
              <h2 className="font-bold">ครุภัณฑ์โอนมารอท่านกดรับ {incoming.length} รายการ</h2>
              <ul className="mt-1 flex flex-col gap-1">
                {incoming.map((t) => (
                  <li key={t.id}>
                    <Link href={`/app/inventory/assets/${t.asset_id}`} prefetch={false} className="underline underline-offset-4">
                      {t.asset_no} {t.asset_name}
                    </Link>{" "}
                    · จาก{t.from_unit_name} · โอนวันที่ {thaiDate(t.sent_on, "short")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {outgoing.length > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              รอปลายทางรับ {outgoing.length} รายการ:{" "}
              {outgoing.map((t, i) => (
                <span key={t.id}>
                  {i ? ", " : ""}
                  <Link href={`/app/inventory/assets/${t.asset_id}`} prefetch={false} className="underline underline-offset-4">
                    {t.asset_no}
                  </Link>{" "}
                  → {t.to_unit_name}
                </span>
              ))}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
            <UnitFilter units={units} value={unit.id} param="unit" allowClear={false} applyLabel="ดูครุภัณฑ์ของหน่วยนี้" />
            <div className="flex flex-wrap content-start gap-2 rounded-xl border bg-card p-4" data-testid="scope-toggle">
              <Link href={`/app/inventory/assets?${assetQuery(unit)}`} aria-current={sub ? "true" : undefined}
                className={cn("rounded-md border px-3 py-2", sub ? "border-primary font-semibold" : "bg-card")}>
                รวมหน่วยใต้สังกัด
              </Link>
              <Link href={`/app/inventory/assets?${assetQuery(unit, { sub: "0" })}`} aria-current={!sub ? "true" : undefined}
                className={cn("rounded-md border px-3 py-2", !sub ? "border-primary font-semibold" : "bg-card")}>
                เฉพาะหน่วยนี้
              </Link>
            </div>
          </div>

          <form method="get" action="/app/inventory/assets" className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="unit" value={unit.id} />
            {sub ? null : <input type="hidden" name="sub" value="0" />}
            <div className="flex flex-col gap-1">
              <label htmlFor="as-q" className="text-sm text-muted-foreground">
                ค้นหา (เลข ชื่อ ยี่ห้อ หมายเลขเครื่อง สถานที่ ผู้รับผิดชอบ)
              </label>
              <Input id="as-q" name="q" defaultValue={one(search.q)} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="as-type-f" className="text-sm text-muted-foreground">
                ประเภท
              </label>
              <select id="as-type-f" name="type" defaultValue={type} className={selectClass}>
                <option value="">ทุกประเภท</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="as-cond-f" className="text-sm text-muted-foreground">
                สภาพ
              </label>
              <select id="as-cond-f" name="cond" defaultValue={cond} className={selectClass}>
                <option value="">ทุกสภาพ</option>
                {(Object.keys(CONDITION_LABEL) as AssetCondition[]).map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline">
              ค้นหา
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {ctx.canEditInventory ? (
              <Button asChild>
                <Link href="/app/inventory/assets/new">เพิ่มครุภัณฑ์</Link>
              </Button>
            ) : null}
            {rows.length ? (
              <Button asChild variant="outline">
                <a href={`/app/inventory/assets/labels?${filterQuery}`} target="_blank" rel="noopener">
                  พิมพ์ป้าย QR ({rows.filter((r) => r.condition !== "disposed").length} รายการ)
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/app/inventory/reports?${base}`}>รายงาน</Link>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground" data-testid="asset-count">
            {rows.length.toLocaleString("th-TH")} รายการ · มูลค่าทุน {baht(rows.reduce((s, r) => s + Number(r.price), 0))} บาท · มูลค่าสุทธิ ณ วันนี้{" "}
            {baht(rows.reduce((s, r) => s + Number(r.net_value), 0))} บาท
          </p>
          {rows.length === 0 ? (
            <p className="mt-4 text-muted-foreground" data-testid="assets-empty">
              ไม่พบครุภัณฑ์{ctx.canEditInventory ? " เพิ่มได้ที่ปุ่ม เพิ่มครุภัณฑ์ (ต้องมีประเภทครุภัณฑ์ที่ผู้ดูแลระบบตั้งไว้ก่อน)" : ""}
            </p>
          ) : (
            <>
              <ul className="mt-3 flex flex-col gap-2 md:hidden" data-testid="asset-cards">
                {rows.map((a) => (
                  <li key={a.id} className="rounded-lg border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/app/inventory/assets/${a.id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                        {a.asset_no}
                      </Link>
                      <ConditionBadge condition={a.condition} />
                    </div>
                    <p className="mt-1">{a.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.type_name} · {a.unit_name}
                      {a.location ? ` · ${a.location}` : ""}
                    </p>
                    <p className="text-sm">
                      ราคา {baht(a.price)} · สุทธิ {baht(a.net_value)}
                      {a.borrower ? ` · ยืมโดย ${a.borrower}` : ""}
                      {a.transfer_to ? ` · กำลังโอนไป${a.transfer_to}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="relative mt-3 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] border-collapse text-left" data-testid="asset-table">
                  <thead className="bg-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2">เลขครุภัณฑ์</th>
                      <th scope="col" className="px-3 py-2">ชื่อ</th>
                      <th scope="col" className="px-3 py-2">ประเภท</th>
                      <th scope="col" className="px-3 py-2">หน่วย / สถานที่ตั้ง</th>
                      <th scope="col" className="px-3 py-2 text-right">ราคา</th>
                      <th scope="col" className="px-3 py-2 text-right">มูลค่าสุทธิ</th>
                      <th scope="col" className="px-3 py-2">สภาพ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id} className="border-t align-top" data-testid="asset-row">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link href={`/app/inventory/assets/${a.id}`} prefetch={false} className="text-primary underline underline-offset-4">
                            {a.asset_no}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          {a.name}
                          {a.borrower ? <span className="block text-sm text-muted-foreground">ยืมโดย {a.borrower}</span> : null}
                          {a.transfer_to ? <span className="block text-sm text-amber-800">กำลังโอนไป{a.transfer_to}</span> : null}
                        </td>
                        <td className="px-3 py-2">{a.type_name}</td>
                        <td className="px-3 py-2">
                          {a.unit_name}
                          {a.location ? <span className="block text-sm text-muted-foreground">{a.location}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{baht(a.price)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{baht(a.net_value)}</td>
                        <td className="px-3 py-2">
                          <ConditionBadge condition={a.condition} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
