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
