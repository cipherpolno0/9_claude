import Link from "next/link";

import { DOC_URGENCY_LABEL, docClassShort, type DocClass, type DocUrgency } from "@/lib/docs";
import type { DocsUnit } from "@/lib/docs";

/** ป้ายชั้นความเร็วและชั้นความลับ (ไม่แสดงเมื่อเป็นปกติ) */
export function DocBadges({ urgency, classification }: { urgency: DocUrgency; classification: DocClass }) {
  return (
    <>
      {urgency !== "normal" ? (
        <span className="mr-1 inline-block rounded border border-destructive px-1.5 text-sm font-bold text-destructive" data-testid="urgency-badge">
          {DOC_URGENCY_LABEL[urgency]}
        </span>
      ) : null}
      {classification !== "normal" ? (
        <span className="mr-1 inline-block rounded bg-destructive px-1.5 text-sm font-bold text-white" data-testid="class-badge">
          {docClassShort(classification)}
        </span>
      ) : null}
    </>
  );
}

export function DocsNoAccess({ isAdmin }: { isAdmin: boolean }) {
  return (
    <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3" data-testid="docs-denied">
      {isAdmin ? (
        <>
          ผู้ดูแลระบบไม่เห็นตัวหนังสือของหน่วย ตั้งค่าหัวหนังสือของหน่วยได้ที่{" "}
          <Link href="/app/docs/settings" className="text-primary underline underline-offset-4">
            ตั้งค่าหัวหนังสือ
          </Link>
        </>
      ) : (
        "บทบาทของท่านยังไม่มีสิทธิ์ดูหนังสือของหน่วย (ผู้ดูแลระบบตั้งได้ที่หน้า สิทธิ์ตามบทบาท หัวข้อ สารบรรณ)"
      )}
    </p>
  );
}

/** เลือกหน่วย (แสดงเมื่อผู้ใช้ทำงานสารบรรณได้มากกว่าหนึ่งหน่วย) */
export function DocsUnitSelect({ units, value, action, extra = {} }: { units: DocsUnit[]; value: string; action: string; extra?: Record<string, string> }) {
  if (units.length < 2) return null;
  return (
    <form method="get" action={action} className="mt-4 flex flex-wrap items-end gap-2" data-testid="docs-unit-select">
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        หน่วย
        <select name="unit" defaultValue={value} className="h-11 rounded-md border border-input bg-background px-3 text-base font-normal">
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-11 rounded-md border px-4 font-medium hover:bg-muted">
        เปลี่ยนหน่วย
      </button>
    </form>
  );
}
