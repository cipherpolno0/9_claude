import "server-only";

import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { fiscalYearOf } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

import type {
  AllocationRow,
  CloseCandidate,
  ClosingSummaryRow,
  DisbursementReportRow,
  MonthlyRow,
  ScopeLine,
  UnitReportRow,
  ApprovalLimit,
  DisbursementRow,
  LedgerRow,
  SpendSummary,
  UseDetail,
  UseRow,
  BudgetItemDetail,
  BudgetOption,
  BudgetTreeRow,
  FiscalYear,
  ItemChange,
  TransferRow,
} from "./budget";

/** ตัวอ่านข้อมูลงบประมาณ (ทำงานในนามผู้ใช้ สิทธิ์ตรวจในฐานข้อมูล) */

export async function fetchFiscalYears(): Promise<FiscalYear[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("id, year_be, starts_on, ends_on, status, note, target_q1, target_q2, target_q3, target_q4, year_end_closed_at, year_end_note")
    .order("year_be", { ascending: false });
  if (error) throw error;
  return (data as FiscalYear[] | null) ?? [];
}

/** ปีที่เลือก: ?year= (พ.ศ.) > ปีงบประมาณของวันนี้ > ปีล่าสุด */
export function pickFiscalYear(years: FiscalYear[], param: string | undefined): FiscalYear | null {
  const wanted = Number(param);
  if (wanted) {
    const hit = years.find((y) => y.year_be === wanted);
    if (hit) return hit;
  }
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  return years.find((y) => y.year_be === fiscalYearOf(today)) ?? years[0] ?? null;
}

export async function fetchBudgetUnits(): Promise<AccessibleOrgUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_units");
  if (error) throw error;
  return (data as AccessibleOrgUnit[] | null) ?? [];
}

/** หน่วยที่เลือก: ?unit= (ต้องดูได้) > หน่วยบนสุดที่ผู้ใช้ดูงบได้ */
export function pickBudgetUnit(units: AccessibleOrgUnit[], param: string | undefined): AccessibleOrgUnit | null {
  const selectable = units.filter((u) => u.selectable);
  if (param) {
    const hit = selectable.find((u) => u.id === param);
    if (hit) return hit;
  }
  const ids = new Set(selectable.map((u) => u.id));
  return selectable.find((u) => !u.parent_id || !ids.has(u.parent_id)) ?? null;
}

export async function fetchBudgetOptions(): Promise<{ sources: BudgetOption[]; categories: BudgetOption[] }> {
  const supabase = await createClient();
  const [s, c] = await Promise.all([
    supabase.from("budget_sources").select("id, name, sort_order, is_active").order("sort_order").order("name"),
    supabase.from("budget_categories").select("id, name, sort_order, is_active").order("sort_order").order("name"),
  ]);
  if (s.error) throw s.error;
  if (c.error) throw c.error;
  return { sources: (s.data as BudgetOption[]) ?? [], categories: (c.data as BudgetOption[]) ?? [] };
}

export async function fetchBudgetTree(yearId: string, unitId: string, includeInactive = false): Promise<BudgetTreeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_tree", {
    p_year: yearId,
    p_unit: unitId,
    p_include_inactive: includeInactive,
  });
  if (error) throw error;
  return (data as BudgetTreeRow[] | null) ?? [];
}

/** คืน null เมื่อไม่พบหรือไม่มีสิทธิ์ (หน้าเว็บแสดงหน้าไม่พบ) */
export async function fetchItemDetail(itemId: string, unitId: string): Promise<BudgetItemDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_item_detail", { p_item: itemId, p_unit: unitId });
  if (error) return null;
  return (data as BudgetItemDetail | null) ?? null;
}

export async function fetchAllocationRows(itemId: string, unitId: string): Promise<AllocationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_allocation_rows", { p_item: itemId, p_unit: unitId });
  if (error) throw error;
  return (data as AllocationRow[] | null) ?? [];
}

export async function fetchItemHistory(itemId: string): Promise<ItemChange[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_item_history", { p_item: itemId });
  if (error) return [];
  return (data as ItemChange[] | null) ?? [];
}

export async function fetchTransferRows(yearId: string, unitId: string): Promise<TransferRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_transfer_rows", { p_year: yearId, p_unit: unitId });
  if (error) throw error;
  return (data as TransferRow[] | null) ?? [];
}

export type TransferRecord = {
  id: string;
  fiscal_year_id: string;
  org_unit_id: string;
  from_item_id: string;
  to_item_id: string;
  amount: number | string;
  reason: string;
  status: string;
  request_id: string | null;
  created_by: string | null;
  created_at: string;
  applied_at: string | null;
};

export async function fetchTransfer(id: string): Promise<TransferRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("budget_transfers")
    .select("id, fiscal_year_id, org_unit_id, from_item_id, to_item_id, amount, reason, status, request_id, created_by, created_at, applied_at")
    .eq("id", id)
    .maybeSingle();
  return (data as TransferRecord | null) ?? null;
}

// ---------------------------------------------------------------
// บทที่ 23
// ---------------------------------------------------------------
export async function fetchUseRows(yearId: string, unitId: string): Promise<UseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_use_rows", { p_year: yearId, p_unit: unitId });
  if (error) throw error;
  return (data as UseRow[] | null) ?? [];
}

export async function fetchUseDetail(id: string): Promise<UseDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_use_detail", { p_id: id });
  if (error) return null;
  return (data as UseDetail | null) ?? null;
}

export async function fetchDisbursementRows(useId: string): Promise<DisbursementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_disbursement_rows", { p_use: useId });
  if (error) return [];
  return (data as DisbursementRow[] | null) ?? [];
}

export async function fetchSpendSummary(yearId: string, unitId: string): Promise<Map<string, SpendSummary>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_spend_summary", { p_year: yearId, p_unit: unitId });
  if (error) throw error;
  return new Map(((data as SpendSummary[] | null) ?? []).map((r) => [r.item_id, r]));
}

export async function fetchLedger(itemId: string, unitId: string): Promise<LedgerRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_ledger", { p_item: itemId, p_unit: unitId });
  if (error) return null;
  return (data as LedgerRow[] | null) ?? [];
}

export async function fetchApprovalLimits(): Promise<ApprovalLimit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_approval_limits")
    .select("id, level, role_key, max_amount, updated_at");
  if (error) throw error;
  return (data as ApprovalLimit[] | null) ?? [];
}

// ---------------------------------------------------------------
// บทที่ 24
// ---------------------------------------------------------------
export async function fetchScopeLines(yearId: string, unitId: string, sub: boolean): Promise<ScopeLine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_scope_lines", { p_year: yearId, p_unit: unitId, p_sub: sub });
  if (error) throw error;
  return (data as ScopeLine[] | null) ?? [];
}

export async function fetchMonthly(yearId: string, unitId: string, sub: boolean): Promise<MonthlyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_monthly", { p_year: yearId, p_unit: unitId, p_sub: sub });
  if (error) throw error;
  return (data as MonthlyRow[] | null) ?? [];
}

export async function fetchUnitReport(yearId: string, unitId: string): Promise<UnitReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_unit_report", { p_year: yearId, p_unit: unitId });
  if (error) throw error;
  return (data as UnitReportRow[] | null) ?? [];
}

export async function fetchDisbursementReport(yearId: string, unitId: string, sub: boolean): Promise<DisbursementReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_disbursement_report", { p_year: yearId, p_unit: unitId, p_sub: sub, p_limit: 5000 });
  if (error) throw error;
  return (data as DisbursementReportRow[] | null) ?? [];
}

export async function fetchCloseCandidates(yearId: string): Promise<CloseCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_close_candidates", { p_year: yearId });
  if (error) throw error;
  return (data as CloseCandidate[] | null) ?? [];
}

export async function fetchClosingSummary(yearId: string): Promise<ClosingSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_year_closing_summary", { p_year: yearId });
  if (error) throw error;
  return (data as ClosingSummaryRow[] | null) ?? [];
}

/**
 * แจ้งเตือนงบเหลือน้อยและคำของบประมาณค้างพิจารณา (ฐานข้อมูลกันแจ้งซ้ำ)
 * เรียกเมื่อเปิดแดชบอร์ดหรือหน้างบประมาณ ถ้าผิดพลาดไม่กระทบการแสดงหน้า
 */
export async function remindBudgetAlerts(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("remind_budget_alerts");
  } catch {
    // งานเสริม
  }
}
