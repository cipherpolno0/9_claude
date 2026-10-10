/** ทะเบียนครุภัณฑ์ (ระบบที่ 7 บทที่ 26): ชนิดข้อมูล ป้ายชื่อ และตัวช่วยที่ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ */

export type AssetCondition = "usable" | "damaged" | "pending_disposal" | "disposed";
export type AcquireMethod = "purchase" | "donation" | "transfer";
export type CountResult = "found" | "damaged" | "missing";

export const CONDITION_LABEL: Record<AssetCondition, string> = {
  usable: "ใช้งานได้",
  damaged: "ชำรุด",
  pending_disposal: "รอจำหน่าย",
  disposed: "จำหน่ายแล้ว",
};

export const CONDITION_CLASS: Record<AssetCondition, string> = {
  usable: "border-emerald-500 bg-emerald-50 text-emerald-900",
  damaged: "border-amber-400 bg-amber-50 text-amber-900",
  pending_disposal: "border-orange-400 bg-orange-50 text-orange-900",
  disposed: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

export const METHOD_LABEL: Record<AcquireMethod, string> = { purchase: "ซื้อ", donation: "บริจาค", transfer: "โอน" };

export const COUNT_RESULT_LABEL: Record<CountResult, string> = { found: "พบ", damaged: "ชำรุด", missing: "ไม่พบ" };

export const ASSET_REPORT_KINDS = ["register", "depreciation", "count", "issues", "compare"] as const;
export type AssetReportKind = (typeof ASSET_REPORT_KINDS)[number];
export const ASSET_REPORT_LABEL: Record<AssetReportKind, string> = {
  register: "ทะเบียนคุมทรัพย์สิน",
  depreciation: "ค่าเสื่อมราคาประจำปี",
  count: "ผลการตรวจนับ",
  issues: "การเบิกวัสดุ",
  compare: "เปรียบเทียบระหว่างหน่วย",
};
export const isAssetReportKind = (v: unknown): v is AssetReportKind => (ASSET_REPORT_KINDS as readonly string[]).includes(String(v));

export type AssetType = { id: string; name: string; useful_life_years: number; sort_order: number; is_active: boolean };
export type SourceOption = { id: string; name: string; is_active: boolean };

export type AssetRow = {
  id: string;
  asset_no: string;
  name: string;
  type_id: string;
  type_name: string;
  brand: string;
  model: string;
  serial_no: string;
  acquired_on: string;
  acquire_method: AcquireMethod;
  price: number | string;
  source_name: string | null;
  life_years: number;
  org_unit_id: string;
  unit_name: string;
  location: string;
  custodian: string;
  condition: AssetCondition;
  disposed_on: string | null;
  is_active: boolean;
  acc_dep: number | string;
  net_value: number | string;
  borrower: string | null;
  transfer_to: string | null;
};

export type ScheduleRow = { year_be: number; opening: number; depreciation: number; closing: number; net: number };

export type AssetDetail = {
  id: string;
  asset_no: string;
  name: string;
  type_id: string;
  type_name: string;
  brand: string;
  model: string;
  serial_no: string;
  acquired_on: string;
  acquire_method: AcquireMethod;
  price: number;
  source_id: string | null;
  source_name: string | null;
  useful_life_years: number | null;
  life_years: number;
  org_unit_id: string;
  unit_name: string;
  location: string;
  custodian: string;
  condition: AssetCondition;
  disposed_on: string | null;
  note: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  acc_dep: number;
  net_value: number;
  schedule: ScheduleRow[];
  transfers: {
    id: string;
    status: "sent" | "received" | "cancelled";
    from_unit_name: string;
    to_unit_name: string;
    sent_on: string;
    received_on: string | null;
    note: string;
    cancel_reason: string;
    created_by_name: string | null;
    received_by_name: string | null;
    can_receive: boolean;
    can_cancel: boolean;
  }[];
  loans: {
    id: string;
    borrower: string;
    loaned_on: string;
    due_on: string | null;
    returned_on: string | null;
    note: string;
    return_note: string;
    overdue: boolean;
  }[];
  repairs: {
    id: string;
    repaired_on: string;
    description: string;
    cost: number;
    vendor: string;
    is_active: boolean;
    cancel_reason: string;
    created_by_name: string | null;
  }[];
  repair_total: number;
  counts: { count_id: string; title: string; status: "open" | "closed"; result: CountResult | null; checked_at: string | null; can_record: boolean }[];
  disposal: { request_id: string; request_no: string; status: string; requester_id: string } | null;
  can_edit: boolean;
  can_view_unit: boolean;
};

export type AssetTransferRow = {
  id: string;
  asset_id: string;
  asset_no: string;
  asset_name: string;
  from_unit_name: string;
  to_unit_name: string;
  sent_on: string;
  note: string;
  can_receive: boolean;
  can_cancel: boolean;
};

export type CountRow = {
  id: string;
  org_unit_id: string;
  unit_name: string;
  title: string;
  include_sub: boolean;
  started_on: string;
  status: "open" | "closed";
  closed_at: string | null;
  total: number;
  found: number;
  damaged: number;
  missing: number;
  unchecked: number;
  can_edit: boolean;
};

export type CountItem = {
  asset_id: string;
  asset_no: string;
  name: string;
  unit_name: string;
  location: string;
  expected_condition: AssetCondition;
  current_condition: AssetCondition;
  result: CountResult | null;
  note: string;
  checked_at: string | null;
  checked_by_name: string | null;
};

export type CountDetail = {
  id: string;
  org_unit_id: string;
  unit_name: string;
  title: string;
  include_sub: boolean;
  started_on: string;
  status: "open" | "closed";
  note: string;
  closed_at: string | null;
  closed_by_name: string | null;
  created_by_name: string | null;
  can_edit: boolean;
  items: CountItem[];
};

export type DepreciationRow = {
  id: string;
  asset_no: string;
  name: string;
  type_name: string;
  unit_name: string;
  acquired_on: string;
  price: number | string;
  life_years: number;
  opening: number | string;
  depreciation: number | string;
  closing: number | string;
  net_value: number | string;
  condition: AssetCondition;
  disposed_on: string | null;
};

export type IssueReportRow = {
  issued_on: string;
  request_no: string;
  warehouse_name: string;
  unit_name: string;
  item_code: string;
  item_name: string;
  item_unit: string;
  quantity: number | string;
  requester_name: string | null;
  purpose: string;
};

export type CompareRow = {
  unit_id: string;
  unit_name: string;
  is_self: boolean;
  has_children: boolean;
  asset_count: number;
  cost: number | string;
  acc_dep: number | string;
  net_value: number | string;
  year_dep: number | string;
  damaged: number;
  pending_disposal: number;
  disposed_in_year: number;
  requisitions_issued: number;
};

/** สรุปผลตรวจนับ (ผลต่าง = ไม่พบ + สภาพที่ตรวจพบต่างจากทะเบียน) */
export function countSummary(items: CountItem[]) {
  const by = (r: CountResult | null) => items.filter((i) => i.result === r).length;
  const changed = items.filter((i) => i.result === "damaged" && i.expected_condition === "usable").length;
  return { total: items.length, found: by("found"), damaged: by("damaged"), missing: by("missing"), unchecked: by(null), changed };
}
