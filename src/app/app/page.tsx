import type { Metadata } from "next";

import { ErrorText } from "@/components/form";
import { PendingRequestsBox } from "@/components/pending-requests-box";
import { requireWorkspace } from "@/lib/auth/guards";
import { fullName } from "@/lib/auth/session";
import { LEVEL_LABEL, SECT_LABEL, type OrgLevel, type Sect } from "@/lib/org-units";
import { remindOverduePlaceRequests } from "@/lib/place-requests-server";
import { fetchMyPendingRequests } from "@/lib/requests/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "แดชบอร์ด" };

type MyUnit = {
  role_key: string;
  role_name: string;
  org_unit_id: string | null;
  org_unit_name: string | null;
  org_unit_code: string | null;
  level: OrgLevel | null;
  sect: Sect | null;
  descendant_count: number;
  all_units: boolean;
};

type Descendant = { id: string; name: string; level: OrgLevel; is_active: boolean; depth: number; code: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { denied } = await searchParams;
  const supabase = await createClient();

  // แจ้งเตือนผู้พิจารณาของคำขอจัดตั้ง-ยุบสำนักที่เกินกำหนด (ไม่เกินวันละ 1 ครั้งต่อขั้น) ทุกครั้งที่มีผู้เปิดแดชบอร์ด
  const [{ data }, pendingRequests] = await Promise.all([
    supabase.rpc("my_org_units"),
    fetchMyPendingRequests(),
    remindOverduePlaceRequests(),
  ]);
  const myUnits = (data as MyUnit[] | null) ?? [];
  const seesAll = myUnits.some((u) => u.all_units);

  let totalUnits = 0;
  if (seesAll) {
    const { count } = await supabase.from("org_units").select("id", { count: "exact", head: true }).eq("is_active", true);
    totalUnits = count ?? 0;
  }

  // รายชื่อหน่วยใต้สังกัดของแต่ละหน่วยที่ดูแล
  const scoped = myUnits.filter((u) => u.org_unit_id && !u.all_units);
  const descendants = new Map<string, Descendant[]>();
  await Promise.all(
    [...new Set(scoped.map((u) => u.org_unit_id!))].map(async (id) => {
      const { data: rows } = await supabase.rpc("descendants_of", { p_org_unit_id: id });
      descendants.set(
        id,
        ((rows as Descendant[] | null) ?? [])
          .filter((d) => d.is_active)
          .sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true })),
      );
    }),
  );

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">แดชบอร์ด</h1>
      <p className="mt-1 text-muted-foreground">
        ยินดีต้อนรับ {ctx.profile ? fullName(ctx.profile) : ctx.user.email}
      </p>

      {denied ? (
        <div className="mt-4">
          <ErrorText>ท่านไม่มีสิทธิ์เข้าหน้าที่เรียก ระบบจึงพากลับมาที่แดชบอร์ด</ErrorText>
        </div>
      ) : null}

      <div className="mt-6">
        <PendingRequestsBox items={pendingRequests} />
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5" data-testid="my-units">
        <h2 className="text-xl font-bold text-primary">เขตที่ท่านดูแล</h2>
        {myUnits.length === 0 ? (
          <p className="mt-2 text-muted-foreground">บัญชีของท่านยังไม่มีบทบาท กรุณาติดต่อผู้ดูแลระบบ</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {myUnits.map((u, i) => {
              const list = u.org_unit_id ? (descendants.get(u.org_unit_id) ?? []) : [];
              return (
                <li key={i} className="rounded-lg border p-3">
                  <p className="font-semibold">
                    {u.role_name}
                    {u.org_unit_name ? ` · ${u.org_unit_name}` : ""}
                  </p>
                  {u.all_units ? (
                    <p className="text-muted-foreground">
                      เข้าถึงได้ทุกเขตปกครอง ทุกนิกาย ({totalUnits.toLocaleString("th-TH")} หน่วย)
                    </p>
                  ) : u.org_unit_id ? (
                    <>
                      <p className="text-muted-foreground">
                        {u.level ? LEVEL_LABEL[u.level] : ""}
                        {u.sect ? ` · ${SECT_LABEL[u.sect]}` : ""} · หน่วยใต้สังกัด{" "}
                        {list.length.toLocaleString("th-TH")} หน่วย
                      </p>
                      {list.length > 0 ? (
                        <details className="mt-2">
                          <summary className="w-fit cursor-pointer font-medium text-primary underline underline-offset-4">
                            ดูรายชื่อหน่วยใต้สังกัด
                          </summary>
                          <ul className="mt-2 flex flex-col gap-0.5">
                            {list.slice(0, 300).map((d) => (
                              <li key={d.id} style={{ paddingLeft: `${(d.depth - 1) * 1.25}rem` }}>
                                <span className="mr-2 rounded bg-accent px-1.5 py-0.5 text-sm font-semibold">
                                  {LEVEL_LABEL[d.level]}
                                </span>
                                {d.name}
                              </li>
                            ))}
                          </ul>
                          {list.length > 300 ? (
                            <p className="mt-1 text-sm text-muted-foreground">แสดง 300 หน่วยแรก</p>
                          ) : null}
                        </details>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground">บทบาทนี้ไม่ผูกกับเขตปกครอง</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-xl border-2 border-dashed border-input bg-secondary px-6 py-8 text-center">
        <p className="text-lg font-semibold text-primary">ส่วนอื่นของแดชบอร์ดอยู่ระหว่างพัฒนา</p>
        <p className="text-muted-foreground">ทางลัดตามบทบาทและสรุปงานของแต่ละระบบ จะเปิดใช้งานในบทเรียนถัดไป</p>
      </div>
    </section>
  );
}
