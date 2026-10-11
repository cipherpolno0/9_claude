import "server-only";

import { requireMenu } from "@/lib/auth/guards";
import { fetchDocsUnits } from "@/lib/docs-server";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

/** หน่วยที่ผู้ใช้ทำงานสารบรรณได้ (?unit=) ค่าเริ่มต้น = หน่วยแรก */
export async function loadDocsScope(search: Record<string, string | string[] | undefined>) {
  const ctx = await requireMenu("/app/docs");
  const units = ctx.canViewDocs ? await fetchDocsUnits() : [];
  const want = one(search.unit);
  const unit = units.find((u) => u.id === want) ?? units[0] ?? null;
  return { ctx, units, unit };
}

export const docsQuery = (unitId: string | null | undefined, extra: Record<string, string | number | null | undefined> = {}) => {
  const q = new URLSearchParams();
  if (unitId) q.set("unit", unitId);
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  return q.toString();
};
