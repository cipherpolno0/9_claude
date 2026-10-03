import "server-only";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import { ORG_LEVELS, SECTS, type OrgUnit } from "@/lib/org-units";
import { createClient } from "@/lib/supabase/server";

/** เงื่อนไขของตารางสาธิต (ใช้ร่วมกันทั้งหน้าจอและการส่งออก Excel เพื่อให้ผลตรงกัน) */
export function demoTableParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["code", "name", "level"],
    defaultSort: "code",
    filters: ["level", "sect", "active"],
    pageSize: 10,
  });
}

export async function queryDemoUnits(params: TableParams, all = false) {
  const supabase = await createClient();
  let query = supabase
    .from("org_units")
    .select("id, parent_id, level, sect, name, code, is_active", { count: "exact" });
  if (params.q) query = query.or(`name.ilike.%${params.q}%,code.ilike.%${params.q}%`);
  if ((ORG_LEVELS as readonly string[]).includes(params.filters.level)) query = query.eq("level", params.filters.level);
  if ((SECTS as readonly string[]).includes(params.filters.sect)) query = query.eq("sect", params.filters.sect);
  if (params.filters.active === "yes") query = query.eq("is_active", true);
  if (params.filters.active === "no") query = query.eq("is_active", false);
  query = query.order(params.sort, { ascending: params.dir === "asc" });
  query = all ? query.limit(10000) : query.range(params.from, params.to);
  const { data, count, error } = await query;
  return { rows: (data as OrgUnit[] | null) ?? [], total: count ?? 0, error };
}
