"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";

import { InfoText } from "@/components/form";
import { ImportDialog, type ImportPreviewResult } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";

type RawRows = { rowNumber: number; cells: string[] }[];

/** ปุ่มนำเข้าแผนงบประมาณจาก Excel (ใช้กล่องนำเข้ากลาง) */
export function PlanImportButton({
  columns,
  preview,
  confirm,
}: {
  columns: readonly string[];
  preview: (formData: FormData) => Promise<ImportPreviewResult<RawRows>>;
  confirm: (payload: RawRows) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileUp aria-hidden />
        นำเข้าจาก Excel
      </Button>
      {flash ? (
        <div className="basis-full">
          <InfoText>{flash}</InfoText>
        </div>
      ) : null}
      {open ? (
        <ImportDialog
          title="นำเข้าแผนงบประมาณจาก Excel"
          columns={columns}
          itemUnit="รายการ"
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
