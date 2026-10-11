import type { Metadata } from "next";
import Link from "next/link";

import { fetchViewerCandidates } from "@/lib/docs-server";

import { ReceiveForm } from "../../doc-forms";
import { docsQuery, loadDocsScope } from "../../scope";
import { DocsNoAccess, DocsUnitSelect } from "../../ui";

export const metadata: Metadata = { title: "ลงทะเบียนหนังสือรับ" };
export const dynamic = "force-dynamic";

/** ลงทะเบียนหนังสือรับจากภายนอก (หนังสือจากหน่วยในระบบ ลงรับที่หน้าทะเบียนรับ) */
export default async function NewReceivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, units, unit } = await loadDocsScope(await searchParams);
  const editable = units.filter((u) => u.can_edit);
  const target = unit?.can_edit ? unit : (editable[0] ?? null);
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/docs?${docsQuery(target?.id, { tab: "receive" })}`} className="text-primary underline underline-offset-4">
          ← ทะเบียนหนังสือรับ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ลงทะเบียนหนังสือรับ</h1>
      {!target ? (
        <DocsNoAccess isAdmin={ctx.isAdmin} />
      ) : (
        <>
          <p className="mt-1 text-muted-foreground">
            {target.name} · เลขทะเบียนรับและวันเวลารับ ระบบออกให้อัตโนมัติเมื่อบันทึก
          </p>
          <DocsUnitSelect units={editable} value={target.id} action="/app/docs/receive/new" />
          <div className="mt-6 rounded-xl border bg-card p-5">
            <ReceiveForm unitId={target.id} candidates={await fetchViewerCandidates(target.id)} selfId={ctx.user.id} />
          </div>
        </>
      )}
    </section>
  );
}
