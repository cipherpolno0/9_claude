import Link from "next/link";

import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/form";
import {
  REQUISITION_STATUS_CLASS,
  REQUISITION_STATUS_LABEL,
  TRANSFER_STATUS_CLASS,
  TRANSFER_STATUS_LABEL,
  warehouseLabel,
  type RequisitionStatus,
  type TransferStatus,
  type Warehouse,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app/inventory", label: "ยอดคงเหลือ" },
  { href: "/app/inventory/requisitions", label: "ใบเบิก" },
  { href: "/app/inventory/receipts", label: "รับเข้า" },
  { href: "/app/inventory/transfers", label: "โอน" },
  { href: "/app/inventory/settings", label: "ตั้งค่า" },
];

/** แถบเมนูย่อยของคลังวัสดุ (เลื่อนแนวนอนได้บนมือถือ) */
export function InventoryNav({ current, query = "" }: { current: string; query?: string }) {
  return (
    <nav aria-label="เมนูคลังวัสดุ" className="mt-3 -mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-2">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={query ? `${n.href}?${query}` : n.href}
              aria-current={current === n.href ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-4 text-base",
                current === n.href ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
              )}
            >
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** เลือกคลัง (ฟอร์ม GET ใช้ได้แม้ไม่มี JavaScript) */
export function WarehouseSelect({ warehouses, current, action, extra = {} }: { warehouses: Warehouse[]; current: Warehouse | null; action: string; extra?: Record<string, string> }) {
  if (warehouses.length === 0) return null;
  return (
    <form method="get" action={action} className="mt-4 flex flex-wrap items-end gap-2" data-testid="warehouse-select">
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
        <label htmlFor="pick-w" className="text-sm text-muted-foreground">
          คลัง
        </label>
        <select id="pick-w" name="w" defaultValue={current?.id} className={selectClass}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {warehouseLabel(w)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline">
        แสดง
      </Button>
    </form>
  );
}

export function RequisitionBadge({ status }: { status: RequisitionStatus }) {
  return (
    <span className={cn("inline-block rounded border px-2 py-0.5 text-sm", REQUISITION_STATUS_CLASS[status])} data-testid="req-status">
      {REQUISITION_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function TransferBadge({ status }: { status: TransferStatus }) {
  return (
    <span className={cn("inline-block rounded border px-2 py-0.5 text-sm", TRANSFER_STATUS_CLASS[status])} data-testid="transfer-status">
      {TRANSFER_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function NoAccess() {
  return (
    <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3" data-testid="inventory-denied">
      บทบาทของท่านยังไม่มีสิทธิ์ดูคลังวัสดุ (ผู้ดูแลระบบตั้งได้ที่หน้า สิทธิ์ตามบทบาท) ถ้าท่านเป็นผู้อนุมัติใบเบิก ดูได้ที่{" "}
      <Link href="/app/inventory/requisitions?tab=approve" className="text-primary underline underline-offset-4">
        ใบเบิกที่รออนุมัติ
      </Link>
    </p>
  );
}

export function NoWarehouse({ canEdit }: { canEdit: boolean }) {
  return (
    <p className="mt-4 rounded-lg border bg-card px-4 py-3" data-testid="no-warehouse">
      ยังไม่มีคลังในเขตของท่าน
      {canEdit ? (
        <>
          {" "}
          เพิ่มคลังได้ที่{" "}
          <Link href="/app/inventory/settings?tab=warehouses" className="text-primary underline underline-offset-4">
            ตั้งค่า &gt; คลัง
          </Link>
        </>
      ) : null}
    </p>
  );
}
