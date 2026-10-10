import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { InfoText } from "@/components/form";
import { requireMenu } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { qty } from "@/lib/inventory";
import { fetchCategories, fetchItem, fetchItemPhotoUrl } from "@/lib/inventory-server";

import { ItemForm } from "../../settings-forms";

export const metadata: Metadata = { title: "วัสดุ" };
export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/inventory");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const item = await fetchItem(id);
  if (!item) notFound();
  const [categories, photo] = await Promise.all([fetchCategories({ includeInactive: true }), fetchItemPhotoUrl(item.id)]);
  const saved = (await searchParams).saved === "1";
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/settings?tab=items" className="text-primary underline underline-offset-4">
          ← ทะเบียนวัสดุ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">
        {item.code} {item.name}
      </h1>
      {saved ? (
        <div className="mt-4">
          <InfoText>เพิ่มวัสดุแล้ว แนบรูปได้ด้านล่าง</InfoText>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวจากที่เก็บไฟล์ส่วนตัว
          <img src={photo} alt={`รูป${item.name}`} className="size-32 rounded-lg border object-cover" data-testid="item-photo" />
        ) : (
          <div className="flex size-32 items-center justify-center rounded-lg border text-sm text-muted-foreground">ยังไม่มีรูป</div>
        )}
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">หมวด</dt>
          <dd>{item.category_name ?? "-"}</dd>
          <dt className="text-muted-foreground">หน่วยนับ</dt>
          <dd>{item.unit}</dd>
          <dt className="text-muted-foreground">จุดสั่งซื้อ</dt>
          <dd>{Number(item.reorder_point) > 0 ? qty(item.reorder_point) : "-"}</dd>
          <dt className="text-muted-foreground">สถานะ</dt>
          <dd>{item.is_active ? "ใช้งาน" : "ปิดใช้งาน"}</dd>
        </dl>
      </div>
      {ctx.canEditInventory ? (
        <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-xl font-bold text-primary">แก้ไขข้อมูลวัสดุ</h2>
          <ItemForm item={item} categories={categories} />
        </div>
      ) : null}
      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-bold text-primary">รูปวัสดุ</h2>
        <p className="text-sm text-muted-foreground">รับไฟล์ JPG หรือ PNG รูปล่าสุดใช้แสดงในหน้า Stock Card</p>
        <div className="mt-3">
          <Attachments
            entityTable="items"
            entityId={item.id}
            orgUnitId={null}
            currentUserId={ctx.user.id}
            canUpload={ctx.canEditInventory}
            refreshOnChange
            inputLabel="แนบรูปวัสดุ"
          />
        </div>
      </div>
    </section>
  );
}
