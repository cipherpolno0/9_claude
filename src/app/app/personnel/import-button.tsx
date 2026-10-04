"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";

import { InfoText } from "@/components/form";
import { ImportDialog } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import { PERSON_IMPORT_HEADERS } from "@/lib/persons";

import { confirmPersonImport, previewPersonImport } from "./actions";

/** ปุ่มนำเข้าบุคคลจาก Excel (ใช้กล่องนำเข้ากลาง) */
export function ImportButton() {
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
          title="นำเข้าบุคคลจาก Excel"
          columns={PERSON_IMPORT_HEADERS}
          itemUnit="รายการ"
          preview={previewPersonImport}
          confirm={confirmPersonImport}
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
