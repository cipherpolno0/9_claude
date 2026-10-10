"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";

import { InfoText } from "@/components/form";
import { ImportDialog, type ImportPreviewResult } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";

type RawRows = { rowNumber: number; cells: string[] }[];

/** ปุ่มนำเข้าจาก Excel ของหน้าผลสอบ (ใช้กล่องนำเข้ากลาง) */
export function ResultsImportButton({
  label,
  title,
  columns,
  itemUnit,
  preview,
  confirm,
}: {
  label: string;
  title: string;
  columns: readonly string[];
  itemUnit: string;
  preview: (formData: FormData) => Promise<ImportPreviewResult<RawRows>>;
  confirm: (payload: RawRows) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <FileUp aria-hidden />
        {label}
      </Button>
      {flash ? (
        <div className="basis-full">
          <InfoText>{flash}</InfoText>
        </div>
      ) : null}
      {open ? (
        <ImportDialog
          title={title}
          columns={columns}
          itemUnit={itemUnit}
          preview={preview}
          confirm={confirm}
          onClose={() => setOpen(false)}
          onDone={(message) => {
            setOpen(false);
            setFlash(message ?? null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
