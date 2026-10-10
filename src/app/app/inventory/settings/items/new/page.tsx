import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { fetchCategories } from "@/lib/inventory-server";

import { ItemForm } from "../../settings-forms";

export const metadata: Metadata = { title: "เพิ่มวัสดุ" };
export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const ctx = await requireMenu("/app/inventory");
  const categories = await fetchCategories();
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/settings?tab=items" className="text-primary underline underline-offset-4">
          ← ทะเบียนวัสดุ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">เพิ่มวัสดุ</h1>
      {ctx.canEditInventory ? (
        <div className="mt-4 rounded-xl border bg-card p-4 sm:p-5">
          <ItemForm categories={categories} />
        </div>
      ) : (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          ท่านไม่มีสิทธิ์แก้ไขทะเบียนวัสดุ
        </p>
      )}
    </section>
  );
}
