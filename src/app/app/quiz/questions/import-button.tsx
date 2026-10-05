"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";

import { InfoText } from "@/components/form";
import { ImportDialog } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import { QUESTION_IMPORT_HEADERS } from "@/lib/quiz";

import { confirmQuestionImport, previewQuestionImport } from "../actions";

/** ปุ่มนำเข้าข้อสอบจาก Excel (ใช้กล่องนำเข้ากลาง) ข้อที่นำเข้าเป็นฉบับร่างเสมอ */
export function QuestionImportButton() {
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
          title="นำเข้าข้อสอบจาก Excel"
          columns={QUESTION_IMPORT_HEADERS}
          itemUnit="ข้อ"
          preview={previewQuestionImport}
          confirm={confirmQuestionImport}
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
