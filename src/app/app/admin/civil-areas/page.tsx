import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/data-table";
import { fetchCivilProvinces } from "@/lib/places-server";
import { createClient } from "@/lib/supabase/server";

import { CivilImportButton } from "./import-button";

export const metadata: Metadata = { title: "เขตการปกครองบ้านเมือง" };
export const dynamic = "force-dynamic";

type Row = {
  code: number;
  name: string;
  prefix: string;
  postal_code: string;
  civil_districts: { name: string; prefix: string; civil_provinces: { name: string } };
};

export default async function CivilAreasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = parseTableParams(await searchParams, { sortable: [], defaultSort: "code", filters: ["province"], pageSize: 20 });
  const province = /^\d{2}$/.test(params.filters.province ?? "") ? Number(params.filters.province) : null;
  const supabase = await createClient();

  let query = supabase
    .from("civil_subdistricts")
    .select("code, name, prefix, postal_code, civil_districts!inner(name, prefix, civil_provinces!inner(name))", {
      count: "exact",
    })
    .order("code")
    .range(params.from, params.to);
  if (province !== null) query = query.gte("code", province * 10000).lt("code", (province + 1) * 10000);
  if (params.q) {
    query = /^\d+$/.test(params.q) ? query.eq("postal_code", params.q.padEnd(5, "0").slice(0, 5)) : query.ilike("name", `%${params.q}%`);
  }
  const [{ data, count }, counts, provinces] = await Promise.all([query, supabase.rpc("civil_area_counts"), fetchCivilProvinces()]);
  const total = (counts.data as { provinces: number; districts: number; subdistricts: number }[] | null)?.[0];

  const rows: DataTableRow[] = ((data as unknown as Row[] | null) ?? []).map((s) => ({
    id: String(s.code),
    cells: [
      s.code,
      `${s.prefix}${s.name}`,
      `${s.civil_districts.prefix}${s.civil_districts.name}`,
      s.civil_districts.civil_provinces.name,
      s.postal_code,
    ],
  }));

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/admin" className="text-primary underline underline-offset-4">
          ← ผู้ดูแลระบบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">เขตการปกครองบ้านเมือง</h1>
          <p className="mt-1 text-muted-foreground">
            จังหวัด อำเภอ ตำบล และรหัสไปรษณีย์ ใช้เป็นตัวเลือกที่อยู่ของทะเบียนสถานที่ (คนละชุดกับเขตปกครองคณะสงฆ์)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/app/admin/civil-areas/template" download>
              ดาวน์โหลดแม่แบบ Excel
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/app/admin/civil-areas/export" download>
              <Download aria-hidden />
              ส่งออกทั้งหมด
            </a>
          </Button>
          <CivilImportButton />
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="civil-counts">
        {[
          ["จังหวัด", total?.provinces ?? 0],
          ["อำเภอและเขต", total?.districts ?? 0],
          ["ตำบลและแขวง", total?.subdistricts ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-bold text-primary">{Number(value).toLocaleString("th-TH")}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <DataTable
          columns={[
            { key: "code", header: "รหัสตำบล" },
            { key: "subdistrict", header: "ตำบล / แขวง" },
            { key: "district", header: "อำเภอ / เขต" },
            { key: "province", header: "จังหวัด" },
            { key: "postal", header: "รหัสไปรษณีย์" },
          ]}
          rows={rows}
          total={count ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          sort=""
          dir="asc"
          q={params.q}
          searchPlaceholder="ค้นหาชื่อตำบล หรือรหัสไปรษณีย์"
          filters={[
            { name: "province", label: "จังหวัด", options: provinces.map((p) => ({ value: String(p.code), label: p.name })) },
          ]}
          filterValues={params.filters}
          emptyText="ยังไม่มีข้อมูล กรุณานำเข้าจาก Excel"
        />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        แก้ไขข้อมูลโดยส่งออกทั้งหมด แก้ในไฟล์ แล้วนำเข้ากลับ รหัสที่มีอยู่จะถูกปรับชื่อและรหัสไปรษณีย์ตามไฟล์ รหัสใหม่จะถูกเพิ่ม
        ไม่มีการลบ
      </p>
    </section>
  );
}
