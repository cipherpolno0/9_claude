import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { DOC_KIND_LABEL, DOC_KINDS } from "@/lib/docs";
import { fetchRetentionRules } from "@/lib/docs-server";
import { thaiDate } from "@/lib/thai";

import { RetentionForm } from "../archive-forms";

export const metadata: Metadata = { title: "อายุการเก็บหนังสือ" };
export const dynamic = "force-dynamic";

/** อายุการเก็บตามชนิดหนังสือ: ผู้ดูแลระบบกรอกตามระเบียบ (เริ่มว่าง) ผู้อื่นดูได้อย่างเดียว */
export default async function RetentionPage() {
  const ctx = await requireMenu("/app/docs");
  const rules = await fetchRetentionRules();
  const byKind = new Map(rules.map((r) => [r.kind, r]));

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/docs?tab=archive" className="text-primary underline underline-offset-4">
          ← คลังเก็บ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">อายุการเก็บหนังสือ</h1>
      <p className="mt-2 text-muted-foreground">
        จำนวนปีที่ต้องเก็บหนังสือแต่ละชนิด นับจากวันปิดเรื่อง (เว้นว่าง = ไม่กำหนด) หนังสือที่ครบอายุแล้วจะแสดงในแท็บ คลังเก็บ
        ด้วยตัวกรอง ครบอายุการเก็บแล้ว ระบบไม่ลบหนังสือเอง
      </p>
      {ctx.isAdmin ? (
        <div className="mt-6 flex flex-col gap-3" data-testid="retention-forms">
          {DOC_KINDS.map((k) => (
            <RetentionForm key={k} kind={k} years={byKind.get(k)?.years ?? null} note={byKind.get(k)?.note ?? ""} />
          ))}
        </div>
      ) : (
        <div className="relative mt-6 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left" data-testid="retention-table">
            <thead>
              <tr className="border-b bg-muted">
                <th className="px-4 py-2">ชนิดหนังสือ</th>
                <th className="px-4 py-2">อายุการเก็บ</th>
                <th className="px-4 py-2">อ้างอิง / หมายเหตุ</th>
                <th className="px-4 py-2">แก้ไขล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {DOC_KINDS.map((k) => {
                const r = byKind.get(k);
                return (
                  <tr key={k} className="border-b last:border-b-0">
                    <td className="px-4 py-2">{DOC_KIND_LABEL[k]}</td>
                    <td className="px-4 py-2">{r?.years ? `${r.years} ปี` : "ไม่กำหนด"}</td>
                    <td className="px-4 py-2">{r?.note || "-"}</td>
                    <td className="px-4 py-2">{r ? thaiDate(r.updated_at, "short") : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
