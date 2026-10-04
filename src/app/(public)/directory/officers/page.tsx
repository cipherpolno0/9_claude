import type { Metadata } from "next";
import Link from "next/link";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { ErrorText } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { parseTableParams } from "@/lib/data-table";
import { explainError } from "@/lib/errors";
import { LEVEL_LABEL, SECTS, SECT_LABEL } from "@/lib/org-units";
import { isUuid } from "@/lib/persons-server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "ทำเนียบผู้ดำรงตำแหน่งปกครอง",
  description: "รายชื่อเจ้าคณะ รองเจ้าคณะ และเลขานุการ ตามเขตปกครอง",
};
export const dynamic = "force-dynamic";

/** ข้อมูลที่หน้าสาธารณะได้รับ มีเพียงเท่านี้ (ฟังก์ชัน public_officers ไม่ส่งข้อมูลส่วนบุคคลอื่นออกมา) */
type Officer = {
  display_name: string;
  person_type: string;
  position_name: string;
  unit_name: string;
  temple_name: string;
  status: string;
  total_count: number;
};

const LEVELS = ["region", "province", "district", "subdistrict"] as const;

export default async function OfficersDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseTableParams(await searchParams, {
    sortable: [],
    defaultSort: "unit",
    filters: ["sect", "level", "region"],
    pageSize: 20,
  });
  const { sect, level, region } = params.filters;
  const supabase = await createClient();
  const [officers, regions] = await Promise.all([
    supabase.rpc("public_officers", {
      p_q: params.q,
      p_sect: (SECTS as readonly string[]).includes(sect) ? sect : null,
      p_level: (LEVELS as readonly string[]).includes(level) ? level : null,
      p_region: isUuid(region ?? "") ? region : null,
      p_limit: params.pageSize,
      p_offset: params.from,
    }),
    supabase.from("org_units").select("id, name").eq("level", "region").eq("is_active", true).order("code"),
  ]);
  const list = (officers.data as Officer[] | null) ?? [];

  const rows: DataTableRow[] = list.map((o, i) => ({
    id: `${params.page}-${i}`,
    cells: [
      <span key="name" className="font-semibold">
        {o.display_name}
      </span>,
      o.position_name,
      <div key="unit">
        {o.unit_name}
        {o.temple_name ? <span className="block text-sm text-muted-foreground">{o.temple_name}</span> : null}
      </div>,
      <StatusBadge key="status" status={o.status} personType={o.person_type} />,
    ],
  }));

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <p>
        <Link href="/registry" className="text-primary underline underline-offset-4">
          ← ทะเบียน
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ทำเนียบผู้ดำรงตำแหน่งปกครอง</h1>
      <p className="mt-2 text-muted-foreground">
        รายชื่อเจ้าคณะ รองเจ้าคณะ และเลขานุการ ที่ดำรงตำแหน่งอยู่ในปัจจุบัน ค้นได้ด้วยชื่อ ฉายา วัด เขตปกครอง หรือตำแหน่ง
      </p>
      <div className="mt-6">
        {officers.error ? <ErrorText>{explainError(officers.error)}</ErrorText> : null}
        <DataTable
          columns={[
            { key: "name", header: "ชื่อ-ฉายา" },
            { key: "position", header: "ตำแหน่ง" },
            { key: "unit", header: "สังกัด" },
            { key: "status", header: "สถานะ" },
          ]}
          rows={rows}
          total={Number(list[0]?.total_count ?? 0)}
          page={params.page}
          pageSize={params.pageSize}
          sort=""
          dir="asc"
          q={params.q}
          searchPlaceholder="ค้นหาชื่อ ฉายา วัด เขต หรือตำแหน่ง"
          filters={[
            { name: "sect", label: "นิกาย", options: SECTS.map((s) => ({ value: s as string, label: SECT_LABEL[s] })) },
            {
              name: "region",
              label: "ภาค",
              options: ((regions.data as { id: string; name: string }[] | null) ?? []).map((r) => ({
                value: r.id,
                label: r.name,
              })),
            },
            { name: "level", label: "ระดับ", options: LEVELS.map((l) => ({ value: l as string, label: LEVEL_LABEL[l] })) },
          ]}
          filterValues={params.filters}
          emptyText="ไม่พบรายชื่อตามเงื่อนไขนี้"
        />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        หน้านี้แสดงเฉพาะ ชื่อ-ฉายา ตำแหน่ง สังกัด และสถานะ ไม่แสดงข้อมูลส่วนบุคคลอื่น
      </p>
    </section>
  );
}
