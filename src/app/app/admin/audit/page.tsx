import type { Metadata } from "next";

import { DataTable, type DataTableRow } from "@/components/data-table";
import { changedFields } from "@/components/record-history";
import { requireAdmin } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/data-table";
import { createClient } from "@/lib/supabase/server";
import { thaiDateTime } from "@/lib/thai";

export const metadata: Metadata = { title: "ประวัติการแก้ไข" };
export const dynamic = "force-dynamic";

const TABLES: Record<string, string> = {
  org_units: "เขตปกครอง",
  academic_years: "ปีการศึกษา",
  profiles: "ข้อมูลผู้ใช้",
  user_roles: "บทบาทของผู้ใช้",
  roles: "บทบาท",
  app_settings: "ค่าตั้ง",
  account_requests: "คำขอบัญชี",
  access_review_rounds: "รอบทบทวนสิทธิ์",
  access_review_decisions: "ผลทบทวนสิทธิ์",
  attachments: "ไฟล์แนบ",
  request_types: "ชนิดคำขอ",
  requests: "คำขอ",
  request_steps: "ขั้นพิจารณา",
};
const ACTIONS: Record<string, string> = { insert: "เพิ่ม", update: "แก้ไข", delete: "ลบ" };

type Log = {
  id: number;
  actor_id: string | null;
  action: string;
  table_name: string;
  row_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = parseTableParams(await searchParams, {
    sortable: ["created_at", "table_name"],
    defaultSort: "created_at",
    defaultDir: "desc",
    filters: ["table", "action"],
    pageSize: 20,
  });

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, actor_id, action, table_name, row_id, old_data, new_data, created_at", { count: "exact" });
  if (params.filters.table) query = query.eq("table_name", params.filters.table);
  if (params.filters.action) query = query.eq("action", params.filters.action);
  if (params.q) query = query.ilike("row_id", `%${params.q}%`);
  const { data, count, error } = await query
    .order(params.sort, { ascending: params.dir === "asc" })
    .range(params.from, params.to);
  const logs = (data ?? []) as Log[];

  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, title_prefix, first_name, monastic_name, last_name")
      .in("id", actorIds);
    for (const p of people ?? []) {
      names.set(p.id, [p.title_prefix, p.first_name, p.monastic_name, p.last_name].filter(Boolean).join(" "));
    }
  }

  const rows: DataTableRow[] = logs.map((log) => {
    const changes = log.action === "update" ? changedFields(log.old_data, log.new_data) : [];
    return {
      id: String(log.id),
      cells: [
        <span key="t" className="whitespace-nowrap">{thaiDateTime(log.created_at)}</span>,
        log.actor_id ? (names.get(log.actor_id) ?? "ไม่ทราบชื่อ") : "ระบบ",
        ACTIONS[log.action] ?? log.action,
        TABLES[log.table_name] ?? log.table_name,
        <details key="d">
          <summary className="cursor-pointer text-primary underline underline-offset-4">
            {log.action === "update" ? `เปลี่ยน ${changes.length} ช่อง` : "ดูข้อมูล"}
          </summary>
          <p className="mt-1 text-sm break-all text-muted-foreground">รหัสแถว: {log.row_id}</p>
          {log.action === "update" ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {changes.map((c) => (
                <li key={c.field} className="break-all">
                  <code>{c.field}</code>: {JSON.stringify(c.from)} → {JSON.stringify(c.to)}
                </li>
              ))}
            </ul>
          ) : (
            <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(log.new_data ?? log.old_data, null, 2)}
            </pre>
          )}
        </details>,
      ],
    };
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ประวัติการแก้ไข</h1>
      <p className="mt-1 text-muted-foreground">ทุกการเพิ่ม แก้ไข และลบ ถูกบันทึกอัตโนมัติ: ใคร ทำอะไร กับตารางใด เมื่อใด</p>
      <div className="mt-6">
        {error ? (
          <p role="alert" className="font-medium text-destructive">อ่านข้อมูลไม่ได้: {error.message}</p>
        ) : (
          <DataTable
            columns={[
              { key: "created_at", header: "เวลา", sortable: true },
              { key: "actor", header: "ผู้ทำ" },
              { key: "action", header: "การกระทำ" },
              { key: "table_name", header: "ตาราง", sortable: true },
              { key: "detail", header: "รายละเอียด" },
            ]}
            rows={rows}
            total={count ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            sort={params.sort}
            dir={params.dir}
            q={params.q}
            searchPlaceholder="ค้นหารหัสแถว"
            filters={[
              { name: "table", label: "ตาราง", options: Object.entries(TABLES).map(([value, label]) => ({ value, label })) },
              { name: "action", label: "การกระทำ", options: Object.entries(ACTIONS).map(([value, label]) => ({ value, label })) },
            ]}
            filterValues={params.filters}
          />
        )}
      </div>
    </section>
  );
}
