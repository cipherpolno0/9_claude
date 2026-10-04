"use client";

import { ImportDialog as SharedImportDialog, type ImportPreviewResult } from "@/components/import-dialog";
import { IMPORT_HEADERS, LEVEL_LABEL, SECT_LABEL, type ImportRawRow } from "@/lib/org-units";

import { confirmImport, previewImport } from "./actions";

/** นำเข้าเขตปกครองจาก Excel (ใช้กล่องนำเข้ากลาง) */
async function preview(formData: FormData): Promise<ImportPreviewResult<ImportRawRow[]>> {
  const result = await previewImport(formData);
  if (!result.ok) return result;
  return {
    ok: true,
    rows: result.rows.map((r) => ({
      rowNumber: r.rowNumber,
      cells: [
        r.code,
        r.name,
        r.level ? LEVEL_LABEL[r.level] : r.levelText,
        r.sect ? SECT_LABEL[r.sect] : r.sectText,
        r.parentCode,
      ],
      status: r.status,
      message: r.status === "skip" ? "" : r.message,
    })),
    payload: result.rows.map((r) => ({
      rowNumber: r.rowNumber,
      code: r.code,
      name: r.name,
      level: r.levelText,
      sect: r.sectText,
      parentCode: r.parentCode,
    })),
  };
}

export function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (message?: string) => void }) {
  return (
    <SharedImportDialog
      title="นำเข้าเขตปกครองจาก Excel"
      columns={IMPORT_HEADERS}
      itemUnit="หน่วย"
      preview={preview}
      confirm={confirmImport}
      onClose={onClose}
      onDone={onDone}
    />
  );
}
