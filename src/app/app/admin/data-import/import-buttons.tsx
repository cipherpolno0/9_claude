"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";

import { InfoText } from "@/components/form";
import { ImportDialog } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import { APPOINTMENT_IMPORT_HEADERS, USER_IMPORT_HEADERS, VENUE_IMPORT_HEADERS } from "@/lib/data-import";

import {
  confirmAppointmentImport,
  confirmUserImport,
  confirmVenueImport,
  previewAppointmentImport,
  previewUserImport,
  previewVenueImport,
} from "./actions";

const KINDS = {
  appointments: {
    label: "นำเข้าตำแหน่ง",
    title: "นำเข้าตำแหน่ง (วาระ) จาก Excel",
    columns: APPOINTMENT_IMPORT_HEADERS,
    itemUnit: "วาระ",
    preview: previewAppointmentImport,
    confirm: confirmAppointmentImport,
  },
  venues: {
    label: "นำเข้าสนามสอบ",
    title: "นำเข้าสนามสอบจาก Excel",
    columns: VENUE_IMPORT_HEADERS,
    itemUnit: "สนาม",
    preview: previewVenueImport,
    confirm: confirmVenueImport,
  },
  users: {
    label: "นำเข้าผู้ใช้",
    title: "นำเข้าผู้ใช้จาก Excel",
    columns: USER_IMPORT_HEADERS,
    itemUnit: "บัญชี",
    preview: previewUserImport,
    confirm: confirmUserImport,
  },
} as const;

/** ปุ่มนำเข้าของหน้า นำเข้าข้อมูลจริง (ใช้กล่องนำเข้ากลาง) */
export function DataImportButton({ kind }: { kind: keyof typeof KINDS }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const k = KINDS[kind];

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} data-testid={`import-${kind}`}>
        <FileUp aria-hidden />
        {k.label}
      </Button>
      {flash ? (
        <div className="basis-full">
          <InfoText>{flash}</InfoText>
        </div>
      ) : null}
      {open ? (
        <ImportDialog
          title={k.title}
          columns={k.columns}
          itemUnit={k.itemUnit}
          preview={k.preview}
          confirm={k.confirm}
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
