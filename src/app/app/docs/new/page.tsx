import type { Metadata } from "next";
import Link from "next/link";

import { currentYearBe } from "@/lib/docs";
import { fetchLetterhead, fetchViewerCandidates } from "@/lib/docs-server";
import { fetchAllActiveUnits } from "@/lib/org-units-server";

import { DraftForm } from "../doc-forms";
import { docsQuery, loadDocsScope } from "../scope";
import { DocsNoAccess, DocsUnitSelect } from "../ui";

export const metadata: Metadata = { title: "ร่างหนังสือส่ง" };
export const dynamic = "force-dynamic";

export default async function NewDraftPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, units, unit } = await loadDocsScope(await searchParams);
  const editable = units.filter((u) => u.can_edit);
  const target = unit?.can_edit ? unit : (editable[0] ?? null);
  const [allUnits, candidates, letterhead] = target
    ? await Promise.all([fetchAllActiveUnits(), fetchViewerCandidates(target.id), fetchLetterhead(target.id)])
    : [[], [], null];
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/docs?${docsQuery(target?.id, { tab: "draft" })}`} className="text-primary underline underline-offset-4">
          ← ร่างหนังสือ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ร่างหนังสือส่ง</h1>
      {!target ? (
        <DocsNoAccess isAdmin={ctx.isAdmin} />
      ) : (
        <>
          <p className="mt-1 text-muted-foreground">
            {target.name} · บันทึกร่างแล้วออกเลขในหน้าหนังสือ จากนั้นพิมพ์ลงนาม หรือแนบไฟล์ PDF ที่ลงนามแล้ว
          </p>
          {!letterhead?.code_prefix ? (
            <p className="mt-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-amber-950" data-testid="no-prefix">
              หน่วยนี้ยังไม่ได้ตั้งรหัสหนังสือ ร่างได้ แต่ต้องตั้งที่{" "}
              <Link href={`/app/docs/settings?${docsQuery(target.id)}`} className="underline underline-offset-4">
                ตั้งค่าหัวหนังสือ
              </Link>{" "}
              ก่อนออกเลขหนังสือภายนอก ภายใน และหนังสือเวียน
            </p>
          ) : null}
          <DocsUnitSelect units={editable} value={target.id} action="/app/docs/new" />
          <div className="mt-6 rounded-xl border bg-card p-5">
            <DraftForm
              unitId={target.id}
              units={allUnits}
              candidates={candidates}
              selfId={ctx.user.id}
              prefix={letterhead?.code_prefix ?? ""}
              yearBe={currentYearBe()}
            />
          </div>
        </>
      )}
    </section>
  );
}
