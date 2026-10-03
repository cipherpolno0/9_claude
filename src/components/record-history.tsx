import { createClient } from "@/lib/supabase/server";
import { thaiDateTime } from "@/lib/thai";

/**
 * ประวัติการแก้ไขของรายการหนึ่ง (อ่านจาก audit_logs) ฝังในหน้าใดก็ได้
 * ใช้: <RecordHistory table="org_units" rowId={id} />
 * ขณะนี้ audit_logs อ่านได้เฉพาะผู้ดูแลระบบ ผู้ใช้อื่นจะเห็นว่าไม่มีประวัติให้ดู
 */

const ACTION_LABEL: Record<string, string> = { insert: "เพิ่ม", update: "แก้ไข", delete: "ลบ" };
const HIDDEN = new Set(["updated_at", "created_at", "last_seen_at"]);

export function changedFields(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  if (!oldData || !newData) return [];
  return Object.keys(newData)
    .filter((k) => !HIDDEN.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((k) => ({ field: k, from: oldData[k], to: newData[k] }));
}

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "(ว่าง)" : typeof v === "object" ? JSON.stringify(v) : String(v));

export async function RecordHistory({ table, rowId }: { table: string; rowId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, actor_id, action, old_data, new_data, created_at")
    .eq("table_name", table)
    .eq("row_id", rowId)
    .order("created_at", { ascending: false })
    .limit(50);
  const logs = (data ?? []) as {
    id: number;
    actor_id: string | null;
    action: string;
    old_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    created_at: string;
  }[];

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

  if (logs.length === 0) {
    return <p className="text-muted-foreground">ไม่มีประวัติให้แสดง (ประวัติดูได้เฉพาะผู้ดูแลระบบ)</p>;
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="record-history">
      {logs.map((log) => {
        const changes = log.action === "update" ? changedFields(log.old_data, log.new_data) : [];
        return (
          <li key={log.id} className="rounded-lg border p-3">
            <p className="font-semibold">
              {ACTION_LABEL[log.action] ?? log.action} · {thaiDateTime(log.created_at)} ·{" "}
              {log.actor_id ? (names.get(log.actor_id) ?? "ไม่ทราบชื่อ") : "ระบบ"}
            </p>
            {changes.length > 0 ? (
              <ul className="mt-1 list-disc pl-6 text-sm">
                {changes.map((c) => (
                  <li key={c.field}>
                    <code>{c.field}</code>: {show(c.from)} → {show(c.to)}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
