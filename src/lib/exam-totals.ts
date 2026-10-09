import type { VenueTotalRow } from "@/lib/exam-batches";

/** ยอดผู้สมัครต่อสนามสอบแบบตาราง (หนึ่งแถวต่อสนาม คอลัมน์ตามช่วงชั้น) ใช้ทั้งหน้าจอและไฟล์ Excel */
export type VenueTotalsTable = {
  stages: string[];
  rows: {
    venue_code: string;
    venue_name: string;
    region_name: string;
    province_name: string;
    byStage: number[];
    total: number;
    certified: number;
    accounts: number;
    pendingAccounts: number;
  }[];
  totals: { byStage: number[]; total: number; certified: number; accounts: number };
};

const STAGE_ORDER = ["ประถม", "มัธยม", "อุดม"];

export const stageLabel = (s: string) => (s ? s : "ผู้สมัคร");

export function pivotVenueTotals(data: VenueTotalRow[]): VenueTotalsTable {
  const stages = [...new Set(data.map((d) => d.stage ?? ""))].sort((a, b) => {
    const ia = STAGE_ORDER.indexOf(a);
    const ib = STAGE_ORDER.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b, "th");
  });
  const map = new Map<string, VenueTotalsTable["rows"][number]>();
  for (const d of data) {
    let row = map.get(d.venue_id);
    if (!row) {
      row = {
        venue_code: d.venue_code,
        venue_name: d.venue_name,
        region_name: d.region_name ?? "",
        province_name: d.province_name ?? "",
        byStage: stages.map(() => 0),
        total: 0,
        certified: 0,
        accounts: 0,
        pendingAccounts: 0,
      };
      map.set(d.venue_id, row);
    }
    row.byStage[stages.indexOf(d.stage ?? "")] += d.sent_count;
    row.total += d.sent_count;
    row.certified += d.certified_count;
    // จำนวนบัญชีเป็นยอดต่อสนาม (ซ้ำกันทุกช่วงชั้น)
    row.accounts = d.account_count;
    row.pendingAccounts = d.pending_account_count;
  }
  const rows = [...map.values()];
  const totals = {
    byStage: stages.map((_, i) => rows.reduce((s, r) => s + r.byStage[i], 0)),
    total: rows.reduce((s, r) => s + r.total, 0),
    certified: rows.reduce((s, r) => s + r.certified, 0),
    accounts: rows.reduce((s, r) => s + r.accounts, 0),
  };
  return { stages, rows, totals };
}
