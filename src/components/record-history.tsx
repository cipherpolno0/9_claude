import { createClient } from "@/lib/supabase/server";
import { thaiDateTime } from "@/lib/thai";

/**
 * ประวัติการแก้ไขของรายการหนึ่ง (อ่านจาก audit_logs) ฝังในหน้าใดก็ได้
 * ใช้: <RecordHistory table="org_units" rowId={id} />  (อ่าน audit_logs โดยตรง ซึ่งเปิดให้เฉพาะผู้ดูแลระบบ)
 * ระบบที่ต้องให้ผู้ใช้อื่นเห็นประวัติ ให้อ่านผ่านฟังก์ชันฐานข้อมูลที่ตรวจสิทธิ์เอง แล้วแสดงด้วย <HistoryList logs={...} />
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

export type HistoryEntry = {
  id: number;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  /** ข้อความนำหน้ารายการ เช่น ชื่อตารางหรือชื่อวาระ (ไม่บังคับ) */
  subject?: string;
};

/**
 * ส่วนแสดงผลของประวัติการแก้ไข ใช้ได้กับประวัติจากแหล่งใดก็ได้
 * labels = ชื่อช่องภาษาไทย / format = แปลงค่าของช่องเป็นข้อความที่อ่านเข้าใจ
 */
export function HistoryList({
  logs,
  labels = {},
  format,
  emptyText = "ยังไม่มีประวัติการแก้ไข",
}: {
  logs: HistoryEntry[];
  labels?: Record<string, string>;
  format?: (field: string, value: unknown) => string | null;
  emptyText?: string;
}) {
  if (logs.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  const text = (field: string, value: unknown) => format?.(field, value) ?? show(value);

  return (
    <ul className="flex flex-col gap-2" data-testid="record-history">
      {logs.map((log) => {
        const changes = log.action === "update" ? changedFields(log.old_data, log.new_data) : [];
        return (
          <li key={log.id} className="rounded-lg border p-3">
            <p className="font-semibold">
              {log.subject ? `${log.subject} · ` : ""}
              {ACTION_LABEL[log.action] ?? log.action} · {thaiDateTime(log.created_at)} · {log.actor_name ?? "ระบบ"}
            </p>
            {changes.length > 0 ? (
              <ul className="mt-1 list-disc pl-6 text-sm">
                {changes.map((c) => (
                  <li key={c.field}>
                    {labels[c.field] ?? <code>{c.field}</code>}: {text(c.field, c.from)} → {text(c.field, c.to)}
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

export async function RecordHistory({ table, rowId }: { table: string; rowId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, actor_id, action, old_data, new_data, created_at")
    .eq("table_name", table)
    .eq("row_id", rowId)
    .order("created_at", { ascending: false })
    .limit(50);
  const logs = (data ?? []) as (Omit<HistoryEntry, "actor_name"> & { actor_id: string | null })[];

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

  return (
    <HistoryList
      logs={logs.map((l) => ({ ...l, actor_name: l.actor_id ? (names.get(l.actor_id) ?? "ไม่ทราบชื่อ") : null }))}
      emptyText="ไม่มีประวัติให้แสดง (ประวัติดูได้เฉพาะผู้ดูแลระบบ)"
    />
  );
}
