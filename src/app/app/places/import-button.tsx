"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";

import { InfoText } from "@/components/form";
import { ImportDialog } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import { PLACE_TYPE_LABEL, placeImportHeaders, type PlaceType } from "@/lib/places";

import { confirmPlaceImport, previewPlaceImport } from "./actions";

/** ปุ่มนำเข้าสถานที่จาก Excel ของประเภทที่เปิดอยู่ (ใช้กล่องนำเข้ากลาง) */
export function PlaceImportButton({ type }: { type: PlaceType }) {
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
          title={`นำเข้า${PLACE_TYPE_LABEL[type]}จาก Excel`}
          columns={placeImportHeaders(type)}
          itemUnit="รายการ"
          preview={previewPlaceImport.bind(null, type)}
          confirm={confirmPlaceImport.bind(null, type)}
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
