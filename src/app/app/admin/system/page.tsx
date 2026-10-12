import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { appEnvironment, ENVIRONMENT_LABEL } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";
import { thaiDateTime } from "@/lib/thai";

export const metadata: Metadata = { title: "สถานะระบบ" };
export const dynamic = "force-dynamic";

type ErrorRow = {
  id: number;
  occurred_at: string;
  source: "server" | "client";
  route_type: string;
  path: string;
  digest: string;
  message: string;
  environment: string;
};

const SOURCE_LABEL = { server: "เซิร์ฟเวอร์", client: "เบราว์เซอร์" } as const;

function Box({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" data-testid={testId}>
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  );
}

/** อ่านสถานะฐานข้อมูลและข้อผิดพลาด (แยกจากส่วนแสดงผล เพราะใช้เวลาปัจจุบัน) */
async function loadStatus(q: string) {
  const supabase = await createClient();

  const started = Date.now();
  const ping = await supabase.rpc("health_ping");
  const dbError = Boolean(ping.error);
  const dbMs = Date.now() - started;

  const since = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
  const countSince = async (hours: number) => {
    const { count } = await supabase.from("app_error_logs").select("id", { count: "exact", head: true }).gte("occurred_at", since(hours));
    return count ?? 0;
  };
  let list = supabase
    .from("app_error_logs")
    .select("id, occurred_at, source, route_type, path, digest, message, environment")
    .order("occurred_at", { ascending: false })
    .limit(100);
  // ค้นเฉพาะตัวอักษรที่ปลอดภัยสำหรับตัวกรองของ PostgREST (รหัสอ้างอิงและเส้นทางหน้าเว็บเป็นอักษรอังกฤษอยู่แล้ว)
  const safe = q.replace(/[^0-9A-Za-z/_\-[\]]/g, "");
  if (safe) list = list.or(`digest.eq.${safe},path.ilike.*${safe}*`);
  const [day, week, rows] = await Promise.all([countSince(24), countSince(24 * 7), list]);
  const errors = (rows.data ?? []) as ErrorRow[];

  return { dbError, dbMs, day, week, errors };
}

export default async function SystemPage({ searchParams }: PageProps<"/app/admin/system">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const { dbError, dbMs, day, week, errors } = await loadStatus(q);

  const env = appEnvironment();
  const project = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https?:\/\//, "").split(".")[0];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">สถานะระบบ</h1>
      <p className="mt-1 text-muted-foreground">สภาพแวดล้อม ฐานข้อมูล ข้อผิดพลาด และการสำรองข้อมูล</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Box title="สภาพแวดล้อม" testId="sys-env">
          <p>
            ชุดที่เปิดอยู่: <strong>{ENVIRONMENT_LABEL[env]}</strong>
          </p>
          <p>โครงการฐานข้อมูล: {project || "-"}</p>
          <p>รุ่นของโค้ด: {(process.env.VERCEL_GIT_COMMIT_SHA ?? "เครื่องผู้พัฒนา").slice(0, 7)}</p>
        </Box>
        <Box title="ฐานข้อมูล" testId="sys-db">
          <p className={dbError ? "font-semibold text-destructive" : "font-semibold"}>
            {dbError ? "เชื่อมต่อไม่ได้" : `ทำงานปกติ (ตอบใน ${dbMs.toLocaleString("th-TH")} มิลลิวินาที)`}
          </p>
          <p className="text-muted-foreground">
            บริการเฝ้าระบบภายนอกเรียก <code>/api/health</code> ทุก 5 นาที และส่งอีเมลถึงผู้ดูแลเมื่อเว็บล่ม (ตั้งค่าตาม docs/ops/ติดตามระบบ.md)
          </p>
        </Box>
        <Box title="ข้อผิดพลาดของระบบ" testId="sys-errors">
          <p>
            24 ชั่วโมงล่าสุด <strong data-testid="errors-24h">{day.toLocaleString("th-TH")}</strong> รายการ · 7 วันล่าสุด{" "}
            <strong>{week.toLocaleString("th-TH")}</strong> รายการ
          </p>
          <p className="text-muted-foreground">เกินเกณฑ์ที่ตั้ง (ค่าตั้ง ops_error_alert_threshold ใน 15 นาที) ระบบแจ้งเตือนผู้ดูแลระบบทุกคน ไม่เกินชั่วโมงละครั้ง</p>
        </Box>
        <Box title="การสำรองข้อมูล" testId="sys-backup">
          <p>สำรองอัตโนมัติทุกวันเวลาประมาณ 02:00 น. ผ่าน GitHub Actions เข้ารหัสแล้วเก็บไว้ 30 วัน</p>
          <p className="text-muted-foreground">ดูผลที่ GitHub &gt; Actions &gt; สำรองข้อมูลรายวัน วิธีกู้คืนอยู่ที่ docs/ops/สำรองและกู้คืน.md</p>
        </Box>
      </div>

      <h2 className="mt-8 text-xl font-semibold">ข้อผิดพลาดล่าสุด</h2>
      <form method="get" className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm">ค้นด้วยรหัสอ้างอิงหรือหน้าเว็บ</span>
          <input name="q" defaultValue={q} className="h-11 w-72 rounded-md border border-input px-3" aria-label="ค้นด้วยรหัสอ้างอิงหรือหน้าเว็บ" />
        </label>
        <Button type="submit" variant="outline">
          ค้นหา
        </Button>
        {q ? (
          <Button asChild variant="ghost">
            <Link href="/app/admin/system">ล้าง</Link>
          </Button>
        ) : null}
      </form>
      {errors.length === 0 ? (
        <p className="mt-3 text-muted-foreground" data-testid="errors-empty">
          ไม่มีข้อผิดพลาด
        </p>
      ) : (
        <div className="relative mt-3 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm" data-testid="errors-table">
            <thead className="bg-muted">
              <tr>
                {["เวลา", "ฝั่ง", "หน้าเว็บ", "ข้อความ", "รหัสอ้างอิง"].map((h) => (
                  <th key={h} scope="col" className="border-b px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id} className="border-b align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{thaiDateTime(e.occurred_at)}</td>
                  <td className="px-3 py-2">
                    {SOURCE_LABEL[e.source]}
                    {e.route_type ? <span className="block text-muted-foreground">{e.route_type}</span> : null}
                  </td>
                  <td className="px-3 py-2 break-all">{e.path || "-"}</td>
                  <td className="px-3 py-2 break-words">{e.message || "-"}</td>
                  <td className="px-3 py-2 font-mono">{e.digest || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
