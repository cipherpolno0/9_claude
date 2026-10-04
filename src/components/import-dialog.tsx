"use client";

import { useState, useTransition } from "react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * กล่องนำเข้าจาก Excel แบบกลาง: อัปโหลด > ตรวจและแสดงตัวอย่าง > ยืนยัน
 * preview = ฟังก์ชันฝั่งเซิร์ฟเวอร์ที่อ่านและตรวจไฟล์ (ยังไม่บันทึก)
 * confirm = ฟังก์ชันฝั่งเซิร์ฟเวอร์ที่บันทึกจริง รับ payload ที่ได้จาก preview (ต้องตรวจซ้ำเองเสมอ)
 */

export type ImportPreviewRow = {
  rowNumber: number;
  cells: string[];
  status: "new" | "skip" | "error";
  message: string;
};

export type ImportPreviewResult<T> =
  | { ok: true; rows: ImportPreviewRow[]; payload: T }
  | { ok: false; error: string };

const STATUS_LABEL: Record<ImportPreviewRow["status"], string> = { new: "เพิ่มใหม่", skip: "ข้าม", error: "ผิด" };

export function ImportDialog<T>({
  title,
  columns,
  itemUnit,
  preview,
  confirm,
  onClose,
  onDone,
}: {
  title: string;
  /** หัวคอลัมน์ของตารางตัวอย่าง (ไม่รวม "แถว" และ "ผลตรวจ") */
  columns: readonly string[];
  /** ลักษณนามของรายการ เช่น "หน่วย" "รายการ" */
  itemUnit: string;
  preview: (formData: FormData) => Promise<ImportPreviewResult<T>>;
  confirm: (payload: T) => Promise<ActionResult>;
  onClose: () => void;
  onDone: (message?: string) => void;
}) {
  const [result, setResult] = useState<Extract<ImportPreviewResult<T>, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [pending, startTransition] = useTransition();

  const upload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const next = await preview(formData);
      if (next.ok) setResult(next);
      else setError(next.error);
    });
  };

  const submit = () => {
    if (!result) return;
    setError(null);
    startTransition(async () => {
      const done = await confirm(result.payload);
      if (done.ok) onDone(done.message);
      else setError(done.error);
    });
  };

  const counts = {
    new: result?.rows.filter((r) => r.status === "new").length ?? 0,
    skip: result?.rows.filter((r) => r.status === "skip").length ?? 0,
    error: result?.rows.filter((r) => r.status === "error").length ?? 0,
  };
  const rows = result ? (onlyErrors ? result.rows.filter((r) => r.status === "error") : result.rows) : [];
  const canConfirm = result !== null && counts.error === 0 && counts.new > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {result
              ? "ตรวจตัวอย่างด้านล่าง ระบบยังไม่บันทึกจนกว่าจะกดยืนยัน"
              : "ใช้ไฟล์ที่กรอกตามแม่แบบของหน้านี้ (นามสกุล .xlsx)"}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={upload} className="flex flex-col gap-4">
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              aria-label="ไฟล์ Excel"
              className="w-full rounded-md border border-input p-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
            />
            <ErrorText>{error}</ErrorText>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "กำลังตรวจไฟล์..." : "อัปโหลดและตรวจ"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="import-counts">
              <p>
                เพิ่มใหม่ <strong>{counts.new.toLocaleString("th-TH")}</strong> แถว
              </p>
              <p>
                ข้าม <strong>{counts.skip.toLocaleString("th-TH")}</strong> แถว
              </p>
              <p className={cn(counts.error > 0 && "font-semibold text-destructive")}>
                ผิด <strong>{counts.error.toLocaleString("th-TH")}</strong> แถว
              </p>
              {counts.error > 0 ? (
                <label className="ml-auto flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--primary)]"
                    checked={onlyErrors}
                    onChange={(e) => setOnlyErrors(e.target.checked)}
                  />
                  แสดงเฉพาะแถวที่ผิด
                </label>
              ) : null}
            </div>

            <div className="max-h-[45vh] overflow-auto rounded-md border">
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {["แถว", ...columns, "ผลตรวจ"].map((h) => (
                      <th key={h} scope="col" className="border-b px-2 py-2 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className={cn("border-b align-top", r.status === "error" && "bg-destructive/5")}>
                      <td className="px-2 py-1.5">{r.rowNumber}</td>
                      {columns.map((_, i) => (
                        <td key={i} className="px-2 py-1.5">
                          {r.cells[i] ?? ""}
                        </td>
                      ))}
                      <td className={cn("min-w-48 px-2 py-1.5", r.status === "error" && "font-semibold text-destructive")}>
                        {STATUS_LABEL[r.status]}
                        {r.message ? `: ${r.message}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {counts.error > 0 ? (
              <p className="font-medium text-destructive">ยังนำเข้าไม่ได้ กรุณาแก้แถวที่ผิดในไฟล์ Excel แล้วอัปโหลดใหม่</p>
            ) : counts.new === 0 ? (
              <p className="font-medium">ไม่มีแถวใหม่ให้นำเข้า ทุกแถวมีในระบบแล้ว</p>
            ) : null}
            <ErrorText>{error}</ErrorText>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setError(null);
                  setOnlyErrors(false);
                }}
                disabled={pending}
              >
                เลือกไฟล์ใหม่
              </Button>
              <Button type="button" onClick={submit} disabled={pending || !canConfirm}>
                {pending ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${counts.new.toLocaleString("th-TH")} ${itemUnit}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
