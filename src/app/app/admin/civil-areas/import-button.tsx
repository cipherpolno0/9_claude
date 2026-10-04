"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";

import { InfoText } from "@/components/form";
import { ImportDialog } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import { CIVIL_IMPORT_HEADERS } from "@/lib/places";

import { confirmCivilImport, previewCivilImport } from "./actions";

/** ปุ่มนำเข้าเขตการปกครองบ้านเมืองจาก Excel (ใช้กล่องนำเข้ากลาง) */
export function CivilImportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
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
          title="นำเข้าเขตการปกครองบ้านเมืองจาก Excel"
          columns={CIVIL_IMPORT_HEADERS}
          itemUnit="ตำบล"
          preview={previewCivilImport}
          confirm={confirmCivilImport}
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
