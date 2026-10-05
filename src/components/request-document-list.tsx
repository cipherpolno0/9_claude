import { Attachments } from "@/components/attachments";
import type { RequestDocument } from "@/lib/place-requests";

/**
 * เอกสารแนบของคำขอ จัดตามรายการที่ผู้ดูแลระบบตั้งไว้ ตามด้วยเอกสารอื่น ๆ
 * รายการที่บังคับและยังไม่มีไฟล์ จะขึ้นป้าย ยังไม่ได้แนบ และผู้พิจารณาเห็นชอบไม่ได้ (ฐานข้อมูลเป็นผู้บังคับ)
 */
export function RequestDocumentList({
  requestId,
  orgUnitId,
  currentUserId,
  canUpload,
  documents,
}: {
  requestId: string;
  orgUnitId: string;
  currentUserId: string;
  canUpload: boolean;
  documents: RequestDocument[];
}) {
  const missing = documents.filter((d) => d.is_required && d.file_count === 0);
  return (
    <div className="flex flex-col gap-4" data-testid="request-documents">
      {missing.length > 0 ? (
        <p
          role="status"
          data-testid="documents-missing"
          className="rounded-md border border-destructive px-3 py-2 font-medium text-destructive"
        >
          เอกสารที่ต้องแนบยังไม่ครบ {missing.length} รายการ: {missing.map((d) => d.name).join(", ")}{" "}
          (ผู้พิจารณาจะเห็นชอบได้เมื่อแนบครบ)
        </p>
      ) : documents.some((d) => d.is_required) ? (
        <p data-testid="documents-complete" className="font-medium text-primary">
          เอกสารที่ต้องแนบครบแล้ว
        </p>
      ) : null}

      {documents.map((doc, index) => (
        <div key={doc.doc_type_id} className="rounded-lg border p-3" data-testid="document-item" data-doc={doc.name}>
          <p className="font-semibold">
            {index + 1}. {doc.name}{" "}
            {doc.is_required ? (
              <span className="font-normal text-destructive">(ต้องแนบ)</span>
            ) : (
              <span className="font-normal text-muted-foreground">{doc.is_active ? "(ถ้ามี)" : "(รายการนี้เลิกใช้แล้ว)"}</span>
            )}
          </p>
          <div className="mt-2">
            <Attachments
              entityTable="requests"
              entityId={requestId}
              orgUnitId={orgUnitId}
              currentUserId={currentUserId}
              canUpload={canUpload && doc.is_active}
              docTypeId={doc.doc_type_id}
              refreshOnChange
              emptyText="ยังไม่ได้แนบ"
              inputLabel={`เลือกไฟล์: ${doc.name}`}
            />
          </div>
        </div>
      ))}

      <div className="rounded-lg border p-3" data-testid="document-item" data-doc="other">
        <p className="font-semibold">{documents.length > 0 ? "เอกสารอื่น" : "ไฟล์แนบ"}</p>
        <div className="mt-2">
          <Attachments
            entityTable="requests"
            entityId={requestId}
            orgUnitId={orgUnitId}
            currentUserId={currentUserId}
            canUpload={canUpload}
            docTypeId={null}
            refreshOnChange
            inputLabel="เลือกไฟล์: เอกสารอื่น"
          />
        </div>
      </div>
    </div>
  );
}
