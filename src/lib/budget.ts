/**
 * ระบบงบประมาณ (ระบบที่ 6): ชนิด ป้ายชื่อ และตัวช่วยที่ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์
 * จำนวนเงินจากฐานข้อมูลเป็น numeric(14,2) ซึ่ง PostgREST ส่งมาเป็นตัวเลขหรือข้อความ
 * ห้ามคำนวณเงินด้วยทศนิยมลอยตัวเพื่อบันทึก ให้ส่งข้อความตัวเลขไปให้ฐานข้อมูลตรวจและคำนวณ
 */

export const BUDGET_KINDS = ["program", "project", "category"] as const;
export type BudgetKind = (typeof BUDGET_KINDS)[number];

export const KIND_LABEL: Record<BudgetKind, string> = {
  program: "แผนงาน",
  project: "โครงการหรือกิจกรรม",
  category: "หมวดรายจ่าย",
};

/** ชั้นถัดลงไป (หมวดรายจ่ายไม่มีชั้นย่อย) */
export const CHILD_KIND: Record<BudgetKind, BudgetKind | null> = {
  program: "project",
  project: "category",
  category: null,
};

export const FISCAL_STATUS_LABEL: Record<string, string> = { open: "เปิด", closed: "ปิด" };

export const TRANSFER_STATUS_LABEL: Record<string, string> = {
  pending: "รอพิจารณา",
  returned: "ส่งกลับแก้ไข",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

export const TRANSFER_STATUS_CLASS: Record<string, string> = {
  pending: "border-amber-400 bg-amber-100 text-amber-900",
  returned: "border-orange-400 bg-orange-100 text-orange-900",
  approved: "border-green-300 bg-green-100 text-green-900",
  rejected: "border-red-300 bg-red-100 text-red-900",
  cancelled: "border-gray-300 bg-gray-100 text-gray-700",
};

export const CHANGE_ACTION_LABEL: Record<string, string> = {
  create: "สร้างรายการ",
  edit: "แก้ไข",
  import: "นำเข้าจาก Excel",
  transfer_in: "รับโอน",
  transfer_out: "โอนออก",
  deactivate: "ปิดใช้งาน",
  activate: "เปิดใช้งาน",
};

export type FiscalYear = {
  id: string;
  year_be: number;
  starts_on: string;
  ends_on: string;
  status: "open" | "closed";
  note: string;
  target_q1: number | string | null;
  target_q2: number | string | null;
  target_q3: number | string | null;
  target_q4: number | string | null;
  /** ปิดสิ้นปีแล้ว (บทที่ 24) */
  year_end_closed_at: string | null;
  year_end_note: string;
};

export type BudgetOption = { id: string; name: string; sort_order: number; is_active: boolean };

export type BudgetTreeRow = {
  id: string;
  parent_id: string | null;
  kind: BudgetKind;
  label: string;
  name: string;
  code: string;
  category_id: string | null;
  category_name: string | null;
  source_id: string | null;
  source_name: string | null;
  note: string;
  owner_unit_id: string;
  owner_unit_name: string;
  owned: boolean;
  is_active: boolean;
  sort_order: number;
  received: number | string;
  allocated: number | string;
  remaining: number | string;
};

export type BudgetTreeNode = BudgetTreeRow & { depth: number; children: BudgetTreeNode[] };

export type BudgetItemDetail = {
  id: string;
  kind: BudgetKind;
  label: string;
  path: string;
  name: string;
  code: string;
  note: string;
  parent_id: string | null;
  category_id: string | null;
  source_id: string | null;
  amount: number | string | null;
  is_active: boolean;
  sort_order: number;
  fiscal_year_id: string;
  year_be: number;
  year_open: boolean;
  owner_unit_id: string;
  owner_unit_name: string;
  owned: boolean;
  received: number | string;
  allocated: number | string;
  /** ผูกพันสุทธิของหน่วยที่ดู (บทที่ 23) */
  committed: number | string;
  disbursed: number | string;
  remaining: number | string;
  can_edit_unit: boolean;
  can_edit_item: boolean;
  has_allocations: boolean;
  pending_transfers: number;
};

export type AllocationRow = {
  id: string;
  direction: "out" | "in";
  from_unit_id: string;
  from_name: string;
  to_unit_id: string | null;
  to_place_id: string | null;
  to_name: string;
  to_detail: string;
  round_no: number;
  allocated_on: string;
  amount: number | string;
  reference_no: string;
  note: string;
  is_active: boolean;
  cancel_reason: string;
  cancelled_at: string | null;
  created_at: string;
  created_by_name: string | null;
  passed_on: number | string | null;
};

export type ItemChange = {
  id: string;
  created_at: string;
  action: string;
  amount_before: number | string | null;
  amount_after: number | string | null;
  detail: Record<string, unknown>;
  reason: string;
  actor_name: string | null;
  transfer_id: string | null;
};

export type TransferRow = {
  id: string;
  from_item_id: string;
  to_item_id: string;
  from_path: string;
  to_path: string;
  amount: number | string;
  reason: string;
  status: string;
  request_id: string | null;
  request_no: string | null;
  created_at: string;
  requester_name: string | null;
  applied_at: string | null;
  is_mine: boolean;
};

export type Recipient = { kind: "unit" | "place"; id: string; name: string; code: string; detail: string };

/** แสดงจำนวนเงิน เช่น 1,234.50 */
export function baht(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/**
 * แปลงข้อความจำนวนเงินที่ผู้ใช้กรอกเป็นข้อความตัวเลขมาตรฐาน (เช่น "๑,๒๐๐.๕" > "1200.5")
 * คืน null เมื่อไม่ใช่ตัวเลข ทศนิยมเกิน 2 ตำแหน่ง หรือเกินเพดาน (ฐานข้อมูลตรวจซ้ำอีกชั้น)
 */
export function parseMoney(text: string, { allowNegative = false } = {}): string | null {
  const s = String(text ?? "")
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/[,\s]/g, "")
    .replace(/บาท$/, "");
  const re = allowNegative ? /^-?\d{1,12}(\.\d{1,2})?$/ : /^\d{1,12}(\.\d{1,2})?$/;
  if (!re.test(s)) return null;
  return s;
}

/** ต้นไม้จากแถวของ budget_tree (เรียงตาม sort_order ที่ฐานข้อมูลส่งมา) */
export function buildBudgetTree(rows: BudgetTreeRow[]): BudgetTreeNode[] {
  const byId = new Map<string, BudgetTreeNode>();
  for (const r of rows) byId.set(r.id, { ...r, depth: 0, children: [] });
  const roots: BudgetTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const setDepth = (nodes: BudgetTreeNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth;
      setDepth(n.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

export function flattenTree(nodes: BudgetTreeNode[]): BudgetTreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

/** ผลรวมของหน่วย = ผลรวมของแผนงานชั้นบนสุด */
export function treeTotals(roots: BudgetTreeNode[]) {
  const sum = (k: "received" | "allocated" | "remaining") => roots.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return { received: sum("received"), allocated: sum("allocated"), remaining: sum("remaining") };
}

/** หัวคอลัมน์ของไฟล์นำเข้าแผนงบประมาณ (แถวแรกของแผ่นงานแรก) */
export const PLAN_IMPORT_HEADERS = ["แผนงาน", "โครงการหรือกิจกรรม", "หมวดรายจ่าย", "วงเงิน (บาท)", "แหล่งเงิน", "หมายเหตุ"] as const;
export const PLAN_IMPORT_MAX_ROWS = 2000;

export type PlanImportRow = {
  row_no: number;
  program: string;
  project: string;
  category: string;
  amount: string;
  source: string;
  note: string;
};

export function planRowFromCells(rowNumber: number, cells: string[]): PlanImportRow {
  const t = (i: number) => String(cells[i] ?? "").replace(/\s+/g, " ").trim();
  return {
    row_no: rowNumber,
    program: t(0),
    project: t(1),
    category: t(2),
    amount: parseMoney(t(3)) ?? t(3),
    source: t(4),
    note: t(5),
  };
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// ---------------------------------------------------------------
// บทที่ 23: คำขอใช้งบ เบิกจ่าย ทะเบียนคุม วงเงินอนุมัติ
// ---------------------------------------------------------------
export const USE_STATUS_LABEL: Record<string, string> = {
  pending: "รอพิจารณา",
  returned: "ส่งกลับแก้ไข",
  approved: "อนุมัติแล้ว (ผูกพัน)",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
  closed: "ปิดแล้ว",
  carried: "ยกไปปีถัดไป",
};

export const USE_STATUS_CLASS: Record<string, string> = {
  ...TRANSFER_STATUS_CLASS,
  closed: "border-slate-300 bg-slate-100 text-slate-800",
  carried: "border-sky-300 bg-sky-100 text-sky-900",
};

export const LEDGER_KIND_LABEL: Record<string, string> = {
  budget: "วงเงิน",
  allocation_in: "ได้รับจัดสรร",
  allocation_out: "จัดสรรต่อ",
  commit: "ผูกพัน",
  disburse: "เบิกจ่าย",
  release: "คืนเงินเหลือจ่าย",
  carry: "ยกยอดไปปีถัดไป",
};

/** หมวดรายจ่ายที่ต้องอ้างอิงรายการรับเข้าของระบบพัสดุ (บทที่ 25-26) */
export const ASSET_CATEGORY_NAMES = ["ค่าวัสดุ", "ค่าครุภัณฑ์"];

export type UseLine = { description: string; quantity: number | string; unit: string; unit_price: number | string; amount?: number | string };

export type UseRow = {
  id: string;
  item_id: string;
  item_path: string;
  purpose: string;
  amount: number | string;
  status: string;
  request_id: string | null;
  request_no: string | null;
  committed: number | string;
  disbursed: number | string;
  released: number | string;
  outstanding: number | string;
  created_at: string;
  approved_at: string | null;
  requester_name: string | null;
};

export type UseDetail = {
  id: string;
  item_id: string;
  item_path: string;
  category_name: string | null;
  org_unit_id: string;
  unit_name: string;
  year_be: number;
  year_open: boolean;
  purpose: string;
  lines: UseLine[];
  amount: number | string;
  status: string;
  request_id: string | null;
  request_no: string | null;
  committed: number | string;
  disbursed: number | string;
  released: number | string;
  outstanding: number | string;
  approved_at: string | null;
  released_at: string | null;
  release_reason: string;
  carried: number | string;
  carried_at: string | null;
  carried_to_id: string | null;
  carried_to_year: number | null;
  carried_from_id: string | null;
  carried_from_year: number | null;
  carried_from_no: string | null;
  created_at: string;
  is_mine: boolean;
  can_edit: boolean;
};

export type DisbursementRow = {
  id: string;
  kind: "payment" | "adjustment";
  installment_no: number;
  adjusts_id: string | null;
  paid_on: string;
  payee: string;
  amount: number | string;
  voucher_no: string;
  note: string;
  reason: string;
  asset_receipt_ref: string | null;
  created_at: string;
  created_by_name: string | null;
  attachment_count: number;
};

export type SpendSummary = { item_id: string; committed: number | string; disbursed: number | string };

export type LedgerRow = {
  happened_on: string;
  happened_at: string;
  kind: string;
  description: string;
  ref_no: string;
  received: number | string;
  committed: number | string;
  disbursed: number | string;
  balance: number | string;
  outstanding: number | string;
};

export type ApprovalLimit = { id: string; level: string; role_key: string; max_amount: number | string | null; updated_at: string };

/** ผลรวมเงินแบบสตางค์ (กันทศนิยมลอยตัวคลาด) ใช้แสดงผลเท่านั้น */
export function sumMoney(values: (number | string | null | undefined)[]): number {
  return values.reduce<number>((a, v) => a + Math.round(Number(v ?? 0) * 100), 0) / 100;
}

/** ยอดของแต่ละบรรทัด = จำนวน x ราคาต่อหน่วย ปัดสองตำแหน่ง (ตรงกับ private.budget_use_lines) */
export function lineAmount(quantity: string, unitPrice: string): number | null {
  const q = parseMoney(quantity);
  const p = parseMoney(unitPrice);
  if (q === null || p === null) return null;
  return Math.round(Number(q) * Number(p) * 100) / 100;
}

/** ยอดผูกพันและเบิกจ่ายต่อแถวของต้นไม้ (ชั้นบน = ผลรวมของชั้นล่าง) จากผลของ budget_spend_summary */
export function treeSpend(roots: BudgetTreeNode[], summary: Map<string, SpendSummary>) {
  const out = new Map<string, { committed: number; disbursed: number }>();
  const walk = (n: BudgetTreeNode): { committed: number; disbursed: number } => {
    const own = summary.get(n.id);
    const acc = { committed: Math.round(Number(own?.committed ?? 0) * 100), disbursed: Math.round(Number(own?.disbursed ?? 0) * 100) };
    for (const c of n.children) {
      const x = walk(c);
      if (!c.is_active) continue;
      acc.committed += Math.round(x.committed * 100);
      acc.disbursed += Math.round(x.disbursed * 100);
    }
    const v = { committed: acc.committed / 100, disbursed: acc.disbursed / 100 };
    out.set(n.id, v);
    return v;
  };
  roots.forEach(walk);
  const active = roots.filter((r) => r.is_active).map((r) => out.get(r.id)!);
  return {
    byId: out,
    total: { committed: sumMoney(active.map((a) => a.committed)), disbursed: sumMoney(active.map((a) => a.disbursed)) },
  };
}

// ---------------------------------------------------------------
// บทที่ 24: แดชบอร์ด รายงาน ปิดปี
// ---------------------------------------------------------------
export type ScopeLine = {
  org_unit_id: string;
  unit_name: string;
  item_id: string;
  item_label: string;
  category_name: string | null;
  source_id: string | null;
  source_name: string | null;
  project_id: string;
  project_name: string;
  program_id: string;
  program_name: string;
  program_code: string;
  owner_unit_id: string;
  owner_unit_name: string;
  sort_key: string;
  received: number | string;
  allocated: number | string;
  committed: number | string;
  disbursed: number | string;
  remaining: number | string;
};

export type MonthlyRow = { month_no: number; month_start: string; committed: number | string; disbursed: number | string };

export type UnitReportRow = {
  org_unit_id: string;
  unit_name: string;
  unit_level: string;
  unit_code: string;
  is_self: boolean;
  has_children: boolean;
  received: number | string;
  allocated: number | string;
  committed: number | string;
  disbursed: number | string;
  remaining: number | string;
};

export type DisbursementReportRow = {
  id: string;
  paid_on: string;
  unit_name: string;
  item_path: string;
  request_no: string;
  purpose: string;
  installment_no: number;
  kind: "payment" | "adjustment";
  payee: string;
  voucher_no: string;
  amount: number | string;
  reason: string;
  note: string;
};

export type CloseCandidate = {
  id: string;
  unit_name: string;
  item_path: string;
  request_no: string;
  purpose: string;
  committed: number | string;
  disbursed: number | string;
  outstanding: number | string;
};

export type ClosingSummaryRow = {
  org_unit_id: string;
  unit_name: string;
  received: number | string;
  allocated: number | string;
  committed: number | string;
  disbursed: number | string;
  released: number | string;
  carried: number | string;
  remaining: number | string;
};

export type MoneyTotals = { received: number; allocated: number; committed: number; disbursed: number; remaining: number };

/** ผลรวมของชุดแถว (ปัดเป็นสตางค์) */
export function moneyTotals(rows: { received: number | string; allocated: number | string; committed: number | string; disbursed: number | string; remaining: number | string }[]): MoneyTotals {
  return {
    received: sumMoney(rows.map((r) => r.received)),
    allocated: sumMoney(rows.map((r) => r.allocated)),
    committed: sumMoney(rows.map((r) => r.committed)),
    disbursed: sumMoney(rows.map((r) => r.disbursed)),
    remaining: sumMoney(rows.map((r) => r.remaining)),
  };
}

/** วงเงินที่หน่วยใช้เอง = วงเงิน - จัดสรรออก */
export const ownBase = (t: { received: number | string; allocated: number | string }) =>
  Math.round((Number(t.received) - Number(t.allocated)) * 100) / 100;

/** ร้อยละการเบิกจ่าย = เบิกจ่าย ÷ วงเงินที่ใช้เอง (null เมื่อไม่มีวงเงิน) */
export function disbursedPercent(t: { received: number | string; allocated: number | string; disbursed: number | string }): number | null {
  const base = ownBase(t);
  if (base <= 0) return null;
  return Math.round((Number(t.disbursed) / base) * 10000) / 100;
}

export const percentText = (v: number | null | undefined) =>
  v === null || v === undefined ? "-" : `${v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export const MONTH_SHORT = ["ต.ค.", "พ.ย.", "ธ.ค.", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย."];
export const QUARTER_LABEL = ["ไตรมาส 1 (ต.ค.–ธ.ค.)", "ไตรมาส 2 (ม.ค.–มี.ค.)", "ไตรมาส 3 (เม.ย.–มิ.ย.)", "ไตรมาส 4 (ก.ค.–ก.ย.)"];

/** เป้าสะสมรายไตรมาสของปี (null = ยังไม่ตั้ง) */
export function yearTargets(year: FiscalYear | null): number[] | null {
  if (!year || year.target_q1 === null || year.target_q1 === undefined) return null;
  return [year.target_q1, year.target_q2, year.target_q3, year.target_q4].map((v) => Number(v ?? 0));
}

/** เป้าสะสม (ร้อยละ) ณ สิ้นเดือนที่ m (0 = ต.ค. ... 11 = ก.ย.) ภายในไตรมาสเพิ่มขึ้นเท่ากันทุกเดือน */
export function monthTarget(targets: number[], m: number): number {
  const q = Math.floor(m / 3);
  const prev = q === 0 ? 0 : targets[q - 1];
  return Math.round((prev + ((targets[q] - prev) * ((m % 3) + 1)) / 3) * 100) / 100;
}

/**
 * เดือนสุดท้ายที่ใช้เทียบเป้า = สิ้นเดือนที่แล้ว (เดือนปัจจุบันยังไม่จบ) คืน -1 เมื่อยังไม่ครบเดือนแรก
 * ปีที่ผ่านไปแล้ว = ก.ย. (11)
 */
export function compareMonthIndex(year: FiscalYear, todayIso: string): number {
  const [ty, tm] = todayIso.split("-").map(Number);
  const [sy, sm] = year.starts_on.split("-").map(Number);
  const idx = ty * 12 + tm - (sy * 12 + sm);
  return Math.min(11, idx - 1);
}

export const BUDGET_REPORT_KINDS = ["plan", "unit", "source", "quarter", "detail"] as const;
export type BudgetReportKind = (typeof BUDGET_REPORT_KINDS)[number];
export const BUDGET_REPORT_LABEL: Record<BudgetReportKind, string> = {
  plan: "ตามแผนงาน โครงการ หมวดรายจ่าย",
  unit: "ตามหน่วย",
  source: "ตามแหล่งเงิน",
  quarter: "รายไตรมาส",
  detail: "รายละเอียดการเบิกจ่าย",
};
export const isBudgetReportKind = (v: unknown): v is BudgetReportKind => (BUDGET_REPORT_KINDS as readonly string[]).includes(String(v));
