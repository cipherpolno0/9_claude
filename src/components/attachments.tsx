"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Download, Paperclip, X } from "lucide-react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { getAttachmentUrl, listAttachments, removeAttachment, uploadAttachment } from "@/lib/attachments/actions";
import { ATTACHMENT_ACCEPT, type Attachment } from "@/lib/attachments/config";

/**
 * ไฟล์แนบกลาง: แสดงรายการ อัปโหลด ดาวน์โหลด และเอาออก ของรายการใดก็ได้
 * ใช้: <Attachments entityTable="requests" entityId={id} orgUnitId={unitId} currentUserId={uid} />
 */
export function Attachments({
  entityTable,
  entityId,
  orgUnitId,
  currentUserId,
  canUpload = true,
  initial = [],
}: {
  entityTable: string;
  entityId: string;
  /** เขตปกครองของเรื่อง: ผู้ที่เข้าถึงหน่วยนี้ได้จะดาวน์โหลดไฟล์ได้ */
  orgUnitId: string | null;
  currentUserId: string;
  canUpload?: boolean;
  initial?: Attachment[];
}) {
  const [items, setItems] = useState<Attachment[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async () => setItems(await listAttachments(entityTable, entityId));

  useEffect(() => {
    let alive = true;
    listAttachments(entityTable, entityId).then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, [entityTable, entityId]);

  const upload = (file: File) => {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("entity_table", entityTable);
    formData.set("entity_id", entityId);
    if (orgUnitId) formData.set("org_unit_id", orgUnitId);
    setError(null);
    startTransition(async () => {
      const result = await uploadAttachment(formData);
      if (!result.ok) setError(result.error);
      await reload();
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const download = (id: string) =>
    startTransition(async () => {
      setError(null);
      const result = await getAttachmentUrl(id);
      if (result.ok) window.open(result.url, "_blank", "noopener");
      else setError(result.error);
    });

  const remove = (id: string) =>
    startTransition(async () => {
      setError(null);
      const result = await removeAttachment(id);
      if (!result.ok) setError(result.error);
      await reload();
    });

  const size = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return (
    <div className="flex flex-col gap-2" data-testid="attachments">
      {items.length === 0 ? (
        <p className="text-muted-foreground">ยังไม่มีไฟล์แนบ</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 break-all">{a.file_name}</span>
              <span className="text-sm text-muted-foreground">{size(a.size_bytes)}</span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => download(a.id)} aria-label={`ดาวน์โหลด ${a.file_name}`}>
                <Download aria-hidden />
                <span className="hidden sm:inline">ดาวน์โหลด</span>
              </Button>
              {a.uploaded_by === currentUserId ? (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(a.id)} aria-label={`เอาออก ${a.file_name}`}>
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{error}</ErrorText>
      {canUpload ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            aria-label="เลือกไฟล์แนบ"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="w-full rounded-md border border-input p-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            {pending ? "กำลังดำเนินการ..." : "PDF รูปภาพ Excel หรือ Word ขนาดไม่เกิน 10 MB"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
