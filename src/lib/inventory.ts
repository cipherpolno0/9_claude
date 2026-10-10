/** คลังวัสดุ (ระบบที่ 7 บทที่ 25): ชนิดข้อมูล ป้ายชื่อ และตัวช่วยที่ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ */

export type WarehouseKind = "main" | "sub";
export type MoveKind = "receive" | "issue" | "transfer_out" | "transfer_in" | "adjust";
export type RequisitionStatus = "pending" | "returned" | "approved" | "rejected" | "cancelled" | "issued";
export type TransferStatus = "sent" | "received" | "cancelled";
export type ReceiptSource = "purchase" | "donation";
export type RequisitionTab = "mine" | "approve" | "issue" | "all";

export const WAREHOUSE_KIND_LABEL: Record<WarehouseKind, string> = { main: "คลังกลาง", sub: "คลังย่อย" };

export const MOVE_KIND_LABEL: Record<MoveKind, string> = {
  receive: "รับเข้า",
  issue: "เบิกจ่าย",
  transfer_out: "โอนออก",
  transfer_in: "โอนเข้า",
  adjust: "ปรับยอด",
};

export const REQUISITION_STATUS_LABEL: Record<RequisitionStatus, string> = {
  pending: "รอพิจารณา",
  returned: "ส่งกลับแก้ไข",
  approved: "อนุมัติแล้ว รอจ่ายของ",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
  issued: "จ่ายของแล้ว",
};

export const REQUISITION_STATUS_CLASS: Record<RequisitionStatus, string> = {
  pending: "border-amber-400 bg-amber-50 text-amber-900",
  returned: "border-orange-400 bg-orange-50 text-orange-900",
  approved: "border-sky-400 bg-sky-50 text-sky-900",
  rejected: "border-destructive bg-destructive/10 text-destructive",
  cancelled: "border-muted-foreground/40 bg-muted text-muted-foreground",
  issued: "border-emerald-500 bg-emerald-50 text-emerald-900",
};

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = { sent: "รอรับ", received: "รับแล้ว", cancelled: "ยกเลิก" };
export const TRANSFER_STATUS_CLASS: Record<TransferStatus, string> = {
  sent: "border-amber-400 bg-amber-50 text-amber-900",
  received: "border-emerald-500 bg-emerald-50 text-emerald-900",
  cancelled: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

export const SOURCE_LABEL: Record<ReceiptSource, string> = { purchase: "จัดซื้อ", donation: "รับบริจาค" };

export const REQUISITION_TABS: { key: RequisitionTab; label: string }[] = [
  { key: "mine", label: "ใบเบิกของฉัน" },
  { key: "approve", label: "รออนุมัติ" },
  { key: "issue", label: "รอจ่ายของ" },
  { key: "all", label: "ทั้งหมดในเขต" },
];

export type Warehouse = {
  id: string;
  org_unit_id: string;
  kind: WarehouseKind;
  parent_id: string | null;
  code: string;
  name: string;
  note: string;
  is_active: boolean;
  unit_name: string;
  parent_name: string | null;
};

export type Category = { id: string; name: string; sort_order: number; is_active: boolean };

export type Item = {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  unit: string;
  reorder_point: number | string;
  note: string;
  is_active: boolean;
  category_name: string | null;
};

export type StockRow = {
  item_id: string;
  code: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  unit: string;
  reorder_point: number | string;
  balance: number | string;
  last_moved_on: string | null;
  has_moves: boolean;
  is_active: boolean;
  is_low: boolean;
};

export type LowStockRow = {
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  item_id: string;
  code: string;
  name: string;
  unit: string;
  balance: number | string;
  reorder_point: number | string;
};

export type CardRow = {
  id: string;
  moved_on: string;
  kind: MoveKind;
  reference_no: string;
  note: string;
  received: number | string;
  issued: number | string;
  balance: number | string;
  unit_price: number | string | null;
  receipt_id: string | null;
  requisition_id: string | null;
  transfer_id: string | null;
  created_at: string;
};

export type RequisitionRow = {
  id: string;
  request_id: string | null;
  request_no: string | null;
  warehouse_id: string;
  warehouse_name: string;
  unit_name: string;
  purpose: string;
  line_count: number;
  status: RequisitionStatus;
  created_at: string;
  approved_at: string | null;
  issued_on: string | null;
  requester_name: string | null;
  is_mine: boolean;
};

export type RequisitionLine = {
  item_id: string;
  code: string;
  name: string;
  unit: string;
  quantity: number | string;
  approved?: number | string | null;
  issued?: number | string | null;
  balance?: number | string;
};

export type RequisitionDetail = {
  id: string;
  request_id: string | null;
  request_no: string | null;
  request_status: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  warehouse_kind: WarehouseKind;
  org_unit_id: string;
  unit_name: string;
  purpose: string;
  status: RequisitionStatus;
  lines: RequisitionLine[];
  created_at: string;
  approved_at: string | null;
  issued_on: string | null;
  issued_at: string | null;
  issue_note: string;
  requester_name: string | null;
  issued_by_name: string | null;
  is_mine: boolean;
  can_decide: boolean;
  can_issue: boolean;
  can_resubmit: boolean;
};

export type TransferRow = {
  id: string;
  transfer_no: string;
  from_warehouse_id: string;
  from_name: string;
  to_warehouse_id: string;
  to_name: string;
  status: TransferStatus;
  sent_on: string;
  received_on: string | null;
  line_count: number;
  can_receive: boolean;
  can_cancel: boolean;
};

export type TransferDetail = {
  id: string;
  transfer_no: string;
  status: TransferStatus;
  from_warehouse_id: string;
  from_name: string;
  to_warehouse_id: string;
  to_name: string;
  from_unit_name: string;
  to_unit_name: string;
  sent_on: string;
  received_on: string | null;
  note: string;
  cancel_reason: string;
  created_by_name: string | null;
  received_by_name: string | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  received_at: string | null;
  lines: { item_id: string; code: string; name: string; unit: string; quantity: number | string }[];
  can_receive: boolean;
  can_cancel: boolean;
};

export type ReceiptRow = {
  id: string;
  receipt_no: string;
  source: ReceiptSource;
  received_on: string;
  document_no: string;
  supplier: string;
  line_count: number;
  total_value: number | string;
  has_disbursement: boolean;
};

export type ReceiptDetail = {
  id: string;
  receipt_no: string;
  source: ReceiptSource;
  received_on: string;
  document_no: string;
  supplier: string;
  note: string;
  warehouse_id: string;
  warehouse_name: string;
  org_unit_id: string;
  unit_name: string;
  created_by_name: string | null;
  created_at: string;
  disbursement: {
    id: string;
    request_no: string | null;
    installment_no: number;
    paid_on: string;
    amount: number | string;
    voucher_no: string;
    purpose: string;
  } | null;
  lines: { item_id: string; code: string; name: string; unit: string; quantity: number | string; unit_price: number | string | null; amount: number | string }[];
  can_attach: boolean;
};

export type DisbursementOption = { id: string; label: string; paid_on: string; amount: number | string };

export type InventorySummary = { my_open: number; to_approve: number; to_issue: number; incoming: number; low_stock: number };

/** ตัวเลือกวัสดุในฟอร์มหลายรายการ (คงเหลือ = ของคลังที่เลือก) */
export type ItemOption = { id: string; code: string; name: string; unit: string; category: string | null; balance: number };

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** จำนวนวัสดุ: ทศนิยมแสดงเฉพาะเมื่อมี (เช่น 12, 2.5) */
export function qty(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/**
 * แปลงจำนวนที่ผู้ใช้กรอกเป็นข้อความตัวเลขมาตรฐาน (รับเลขไทย และจุลภาค) คืน null เมื่อไม่ใช่ตัวเลขไม่ติดลบ
 * ทศนิยมไม่เกิน 2 ตำแหน่ง (ฐานข้อมูลตรวจซ้ำอีกชั้น)
 */
export function parseQty(text: string, { allowNegative = false } = {}): string | null {
  const s = String(text ?? "")
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/[,\s]/g, "");
  const re = allowNegative ? /^-?\d{1,9}(\.\d{1,2})?$/ : /^\d{1,9}(\.\d{1,2})?$/;
  return re.test(s) ? s : null;
}

export function isRequisitionTab(v: unknown): v is RequisitionTab {
  return v === "mine" || v === "approve" || v === "issue" || v === "all";
}

/** ป้ายชื่อคลังในตัวเลือก */
export function warehouseLabel(w: Pick<Warehouse, "code" | "name" | "kind">): string {
  return `${w.name} (${WAREHOUSE_KIND_LABEL[w.kind]} · ${w.code})`;
}

/** วันที่วันนี้ตามเวลาประเทศไทย (YYYY-MM-DD) */
export function todayIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}
