"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LEVEL_LABEL, SECT_LABEL, type ImportRow } from "@/lib/org-units";
import { cn } from "@/lib/utils";

import { confirmImport, previewImport, type ImportPreview } from "./actions";

const STATUS_LABEL: Record<ImportRow["status"], string> = {
  new: "เพิ่มใหม่",
  skip: "ข้าม",
  error: "ผิด",
};

export function ImportDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message?: string) => void;
}) {
  const [preview, setPreview] = useState<Extract<ImportPreview, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [pending, startTransition] = useTransition();

  const upload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await previewImport(formData);
      if (result.ok) setPreview(result);
      else setError(result.error);
    });
  };

  const confirm = () => {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmImport(
        preview.rows.map((r) => ({
          rowNumber: r.rowNumber,
          code: r.code,
          name: r.name,
          level: r.levelText,
          sect: r.sectText,
          parentCode: r.parentCode,
        })),
      );
      if (result.ok) onDone(result.message);
      else setError(result.error);
    });
  };

  const rows = preview ? (onlyErrors ? preview.rows.filter((r) => r.status === "error") : preview.rows) : [];
  const canConfirm = preview !== null && preview.counts.error === 0 && preview.counts.new > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>นำเข้าเขตปกครองจาก Excel</DialogTitle>
          <DialogDescription>
            {preview
              ? "ตรวจตัวอย่างด้านล่าง ระบบยังไม่บันทึกจนกว่าจะกดยืนยัน"
              : "ใช้ไฟล์ที่กรอกตามแม่แบบของหน้านี้ (นามสกุล .xlsx)"}
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <form onSubmit={upload} className="flex flex-col gap-4">
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              aria-label="ไฟล์ Excel"
              className="w-full rounded-md border border-input p-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
            />
            {error ? (
              <p role="alert" className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 font-medium text-destructive">
                {error}
              </p>
            ) : null}
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p>
                เพิ่มใหม่ <strong>{preview.counts.new.toLocaleString("th-TH")}</strong> แถว
              </p>
              <p>
                ข้าม <strong>{preview.counts.skip.toLocaleString("th-TH")}</strong> แถว
              </p>
              <p className={cn(preview.counts.error > 0 && "font-semibold text-destructive")}>
                ผิด <strong>{preview.counts.error.toLocaleString("th-TH")}</strong> แถว
              </p>
              {preview.counts.error > 0 ? (
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
                    {["แถว", "รหัสหน่วย", "ชื่อหน่วย", "ระดับ", "นิกาย", "รหัสหน่วยเหนือ", "ผลตรวจ"].map((h) => (
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
                      <td className="px-2 py-1.5">{r.code}</td>
                      <td className="px-2 py-1.5">{r.name}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.level ? LEVEL_LABEL[r.level] : r.levelText}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.sect ? SECT_LABEL[r.sect] : r.sectText}</td>
                      <td className="px-2 py-1.5">{r.parentCode}</td>
                      <td className={cn("px-2 py-1.5", r.status === "error" && "font-semibold text-destructive")}>
                        {STATUS_LABEL[r.status]}
                        {r.message && r.status !== "skip" ? `: ${r.message}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.counts.error > 0 ? (
              <p className="font-medium text-destructive">
                ยังนำเข้าไม่ได้ กรุณาแก้แถวที่ผิดในไฟล์ Excel แล้วอัปโหลดใหม่
              </p>
            ) : preview.counts.new === 0 ? (
              <p className="font-medium">ไม่มีแถวใหม่ให้นำเข้า ทุกรหัสมีในระบบแล้ว</p>
            ) : null}
            {error ? (
              <p role="alert" className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 font-medium text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setError(null);
                  setOnlyErrors(false);
                }}
                disabled={pending}
              >
                เลือกไฟล์ใหม่
              </Button>
              <Button type="button" onClick={confirm} disabled={pending || !canConfirm}>
                {pending ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${preview.counts.new.toLocaleString("th-TH")} หน่วย`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
