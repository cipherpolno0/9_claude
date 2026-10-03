import type { Metadata } from "next";
import Link from "next/link";

import { Attachments } from "@/components/attachments";
import { DataTable, type DataTableRow } from "@/components/data-table";
import { RecordHistory } from "@/components/record-history";
import { RequestTimeline } from "@/components/request-timeline";
import { Button } from "@/components/ui/button";
import { requireAccountManager } from "@/lib/auth/guards";
import { LEVEL_LABEL, ORG_LEVELS, SECTS, SECT_LABEL } from "@/lib/org-units";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import type { TimelineData } from "@/lib/requests/labels";
import { createClient } from "@/lib/supabase/server";

import { NotifyDemo, PickerDemo, RequestDemo } from "./demo-widgets";
import { demoTableParams, queryDemoUnits } from "./query";

export const metadata: Metadata = { title: "สาธิตชิ้นส่วนกลาง" };
export const dynamic = "force-dynamic";

function Section({ no, title, note, children }: { no: number; title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5" id={`demo-${no}`}>
      <h2 className="text-xl font-bold text-primary">
        {no}. {title}
      </h2>
      <p className="mb-4 text-muted-foreground">{note}</p>
      {children}
    </div>
  );
}

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccountManager();
  const supabase = await createClient();
  const params = demoTableParams(await searchParams);

  const [table, units, latest] = await Promise.all([
    queryDemoUnits(params),
    fetchAccessibleUnits(),
    supabase
      .from("requests")
      .select("id, request_no")
      .eq("requester_id", ctx.user.id)
      .eq("type_key", "test")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // เส้นเวลาแบบสาธารณะของคำขอทดสอบล่าสุดที่ผู้ใช้ยื่น
  let publicTimeline: TimelineData | null = null;
  if (latest.data) {
    const { data } = await supabase.rpc("public_request_status", { p_request_no: latest.data.request_no });
    publicTimeline = data as TimelineData | null;
  }

  const rows: DataTableRow[] = table.rows.map((u) => ({
    id: u.id,
    cells: [
      u.code,
      u.name,
      LEVEL_LABEL[u.level],
      u.sect ? SECT_LABEL[u.sect] : "-",
      u.is_active ? "ใช้งาน" : "ปิดใช้งาน",
    ],
  }));

  const firstUnit = units.find((u) => u.selectable);
  const sampleUnit = table.rows[0];

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">สาธิตชิ้นส่วนกลาง</h1>
      <p className="mt-1 text-muted-foreground">
        ชิ้นส่วนที่ทุกระบบใช้ซ้ำ ทดลองใช้ได้ที่หน้านี้ ข้อมูลที่สร้างจากหน้านี้เป็นข้อมูลทดสอบ
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <Section no={1} title="ตารางข้อมูลกลาง" note="ค้นหา กรอง เรียง แบ่งหน้า และส่งออก Excel ตามเงื่อนไขที่ใช้อยู่ (ตัวอย่าง: เขตปกครอง)">
          <DataTable
            columns={[
              { key: "code", header: "รหัสหน่วย", sortable: true },
              { key: "name", header: "ชื่อหน่วย", sortable: true },
              { key: "level", header: "ระดับ", sortable: true },
              { key: "sect", header: "นิกาย" },
              { key: "active", header: "สถานะ" },
            ]}
            rows={rows}
            total={table.total}
            page={params.page}
            pageSize={params.pageSize}
            sort={params.sort}
            dir={params.dir}
            q={params.q}
            searchPlaceholder="ค้นหาชื่อหรือรหัสหน่วย"
            filters={[
              { name: "level", label: "ระดับ", options: ORG_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })) },
              { name: "sect", label: "นิกาย", options: SECTS.map((s) => ({ value: s, label: SECT_LABEL[s] })) },
              { name: "active", label: "สถานะ", options: [{ value: "yes", label: "ใช้งาน" }, { value: "no", label: "ปิดใช้งาน" }] },
            ]}
            filterValues={params.filters}
            exportHref="/app/admin/demo/export"
          />
        </Section>

        <Section no={2} title="ตัวเลือกเขตปกครองแบบไล่ชั้น" note="แสดงเฉพาะหน่วยที่ท่านเข้าถึงได้ หน่วยเหนือในสายของท่านแสดงไว้ให้ไล่ชั้นลงมาเท่านั้น">
          <PickerDemo units={units} />
        </Section>

        <Section no={3} title="ไฟล์แนบ" note="รับ PDF รูปภาพ Excel Word ไม่เกิน 10 MB ดาวน์โหลดได้เฉพาะผู้อัปโหลดและผู้ที่เข้าถึงหน่วยของเรื่องนั้นได้">
          <Attachments
            entityTable="demo"
            entityId={ctx.user.id}
            orgUnitId={firstUnit?.id ?? null}
            currentUserId={ctx.user.id}
          />
        </Section>

        <Section no={4} title="แจ้งเตือน" note="แจ้งเตือนแสดงที่กระดิ่งบนแถบบน กดที่รายการเพื่อไปยังเรื่องนั้น">
          <NotifyDemo />
        </Section>

        <Section no={5} title="ประวัติการแก้ไข" note="ทุกตารางบันทึกประวัติอัตโนมัติ ชิ้นส่วนนี้ฝังในหน้าใดก็ได้เพื่อแสดงประวัติของรายการเดียว">
          {ctx.isAdmin ? (
            <>
              {sampleUnit ? (
                <>
                  <p className="mb-2 font-semibold">ประวัติของ: {sampleUnit.name}</p>
                  <RecordHistory table="org_units" rowId={sampleUnit.id} />
                </>
              ) : null}
              <Button asChild variant="outline" className="mt-3">
                <Link href="/app/admin/audit">เปิดหน้าประวัติการแก้ไขทั้งหมด</Link>
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">ประวัติการแก้ไขดูได้เฉพาะผู้ดูแลระบบ</p>
          )}
        </Section>

        <Section no={6} title="เครื่องอนุมัติกลาง" note="ยื่นคำขอทดสอบ ระบบออกเลขที่ สร้างขั้นพิจารณาตามสายการปกครอง และแจ้งผู้พิจารณา (ชนิดทดสอบเริ่มพิจารณาที่หน่วยเหนือ)">
          <RequestDemo units={units} />
          {latest.data && publicTimeline ? (
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 font-semibold">เส้นเวลาแบบสาธารณะของคำขอล่าสุดที่ท่านยื่น (ไม่แสดงชื่อผู้พิจารณาและความเห็น)</p>
              <RequestTimeline data={publicTimeline} />
              <Button asChild variant="outline" className="mt-3">
                <Link href={`/app/approvals/${latest.data.id}`}>เปิดคำขอนี้ในพื้นที่ทำงาน</Link>
              </Button>
            </div>
          ) : null}
          <p className="mt-4">
            <Link href="/app/approvals" className="text-primary underline underline-offset-4">
              งานรอพิจารณาและคำขอที่ท่านยื่น
            </Link>
          </p>
        </Section>

        <Section no={7} title="หน้าพิมพ์กลาง" note="กระดาษ A4 ฟอนต์ Sarabun มีหัวกระดาษ เลือกเลขไทยหรือเลขอารบิกได้ แล้วพิมพ์หรือบันทึกเป็น PDF จากเบราว์เซอร์">
          <Button asChild>
            <Link href="/app/admin/demo/print">เปิดตัวอย่างหน้าพิมพ์</Link>
          </Button>
        </Section>
      </div>
    </section>
  );
}
