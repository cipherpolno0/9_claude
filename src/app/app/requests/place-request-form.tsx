"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, Field, SubmitButton } from "@/components/form";
import { SearchPicker, type PickerItem } from "@/components/search-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadAttachment } from "@/lib/attachments/actions";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from "@/lib/attachments/config";
import {
  DEPARTMENTS,
  SAMNAK_TYPES,
  SAMNAK_TYPE_LABEL,
  type DepartmentCounts,
  type PlaceRequestType,
  type RequestDocumentType,
  type SamnakType,
} from "@/lib/place-requests";

import { searchResponsiblePersons, searchTemples } from "../places/actions";
import { resubmitPlaceRequest, searchSamnak, submitPlaceRequest } from "./actions";
import {
  LockedPick,
  VenueChangeFields,
  VenueOpenFields,
  type VenueRequestInitial,
  type YearOption,
} from "./venue-request-fields";

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const fileClass =
  "w-full rounded-md border border-input p-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium";

export type PlaceRequestInitial = {
  name?: string;
  placeType?: SamnakType | null;
  temple?: PickerItem | null;
  head?: PickerItem | null;
  counts?: DepartmentCounts;
  buildings?: string;
  detail?: string;
  supportPlan?: string;
  place?: PickerItem | null;
  /** ค่าเริ่มต้นของคำขอเปิด ปิด ย้ายสนามสอบ */
  venue?: VenueRequestInitial;
};

/**
 * ฟอร์มคำขอของระบบที่ 4: จัดตั้ง / ยุบ สำนักเรียน สำนักศาสนศึกษา และ เปิด / ปิด / ย้าย สนามสอบ
 * ยื่นใหม่: บันทึกคำขอก่อน แล้วแนบเอกสารทีละไฟล์ (แต่ละไฟล์ไม่เกิน 10 MB) จากนั้นพาไปหน้าคำขอ
 * แก้ไขแล้วส่งใหม่ (requestId): วัดที่ตั้ง สำนัก สถานที่ตั้ง หรือสนามสอบของคำขอเปลี่ยนไม่ได้ เอกสารแนบจัดการที่หน้าคำขอ
 */
export function PlaceRequestForm({
  type,
  docTypes,
  requestId,
  initial = {},
  years = [],
}: {
  type: PlaceRequestType;
  docTypes: RequestDocumentType[];
  requestId?: string;
  initial?: PlaceRequestInitial;
  /** ปีการศึกษาในระบบ (ใช้กับคำขอสนามสอบ) */
  years?: YearOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(requestId);
  const establish = type === "samnak_establish";

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    setError(null);

    // ตรวจเบื้องต้นบนหน้าจอ (ฐานข้อมูลตรวจซ้ำทั้งหมด)
    let data: Record<string, unknown>;
    if (establish) {
      if (!text("name")) return setError("กรุณากรอกชื่อสำนักที่ขอจัดตั้ง");
      if (!text("place_type")) return setError("กรุณาเลือกประเภท สำนักเรียน หรือ สำนักศาสนศึกษา");
      if (!text("temple_id")) return setError("กรุณาค้นหาแล้วเลือกวัดที่ตั้ง");
      if (!text("head_person_id")) return setError("กรุณาค้นหาแล้วเลือกเจ้าสำนัก");
      const counts: Record<string, { teachers: string; students: string }> = {};
      for (const d of DEPARTMENTS) {
        const teachers = text(`teachers_${d.key}`);
        const students = text(`students_${d.key}`);
        if (![teachers, students].every((v) => v === "" || /^\d{1,6}$/.test(v))) {
          return setError("จำนวนครูและนักเรียนต้องเป็นตัวเลข 0 ถึง 100,000");
        }
        counts[d.key] = { teachers, students };
      }
      if (!text("buildings")) return setError("กรุณากรอกอาคารสถานที่");
      if (!text("detail")) return setError("กรุณาระบุเหตุผล");
      data = {
        name: text("name"),
        place_type: text("place_type"),
        temple_id: text("temple_id"),
        head_person_id: text("head_person_id"),
        counts,
        buildings: text("buildings"),
        detail: text("detail"),
      };
    } else if (type === "samnak_dissolve") {
      if (!text("place_id")) return setError("กรุณาค้นหาแล้วเลือกสำนักที่ขอยุบ");
      if (!text("detail")) return setError("กรุณาระบุเหตุผล");
      if (!text("support_plan")) return setError("กรุณากรอกแผนรองรับนักเรียนและบุคลากร");
      data = { place_id: text("place_id"), detail: text("detail"), support_plan: text("support_plan") };
    } else if (type === "venue_open") {
      const levels = form.getAll("levels").map(String);
      if (!text("name")) return setError("กรุณากรอกชื่อสนามสอบ");
      if (!text("venue_type")) return setError("กรุณาเลือกประเภท นักธรรม หรือ ธรรมศึกษา");
      if (!text("place_id")) return setError("กรุณาค้นหาแล้วเลือกสถานที่ตั้ง");
      if (levels.length === 0) return setError("กรุณาเลือกชั้นที่เปิดสอบอย่างน้อย 1 ชั้น");
      if (!/^\d{1,6}$/.test(text("capacity")) || Number(text("capacity")) < 1) {
        return setError("กรุณากรอกจำนวนผู้เข้าสอบโดยประมาณ เป็นตัวเลข 1 ถึง 100,000");
      }
      if (!text("start_year_be")) return setError("กรุณาเลือกปีการศึกษาที่เริ่ม");
      if (!text("chair_person_id")) return setError("กรุณาค้นหาแล้วเลือกประธานสนามสอบ");
      if (!text("receiver_person_id")) return setError("กรุณาค้นหาแล้วเลือกผู้รับข้อสอบ");
      data = {
        name: text("name"),
        venue_type: text("venue_type"),
        place_id: text("place_id"),
        levels,
        capacity: text("capacity"),
        start_year_be: text("start_year_be"),
        chair_person_id: text("chair_person_id"),
        receiver_person_id: text("receiver_person_id"),
        detail: text("detail"),
      };
    } else if (type === "venue_close") {
      if (!text("venue_id")) return setError("กรุณาค้นหาแล้วเลือกสนามสอบที่ขอปิด");
      if (!text("replacement_venue_id")) return setError("กรุณาค้นหาแล้วเลือกสนามสอบที่จะรับผู้เข้าสอบแทน");
      if (!text("detail")) return setError("กรุณาระบุเหตุผล");
      data = { venue_id: text("venue_id"), replacement_venue_id: text("replacement_venue_id"), detail: text("detail") };
    } else {
      if (!text("venue_id")) return setError("กรุณาค้นหาแล้วเลือกสนามสอบที่ขอย้าย");
      if (!text("to_place_id")) return setError("กรุณาค้นหาแล้วเลือกสถานที่ตั้งใหม่");
      if (!text("effective_year_be")) return setError("กรุณาเลือกปีการศึกษาที่มีผล");
      if (!text("detail")) return setError("กรุณาระบุเหตุผล");
      data = {
        venue_id: text("venue_id"),
        to_place_id: text("to_place_id"),
        effective_year_be: text("effective_year_be"),
        detail: text("detail"),
      };
    }

    // เอกสารแนบ (เฉพาะตอนยื่นใหม่)
    const files: { file: File; docTypeId: string | null; label: string }[] = [];
    if (!editing) {
      const missing: string[] = [];
      for (const doc of docTypes) {
        const file = form.get(`doc_${doc.id}`);
        if (file instanceof File && file.size > 0) files.push({ file, docTypeId: doc.id, label: doc.name });
        else if (doc.is_required) missing.push(doc.name);
      }
      const other = form.get("doc_other");
      if (other instanceof File && other.size > 0) files.push({ file: other, docTypeId: null, label: "เอกสารอื่น" });
      if (missing.length) return setError(`กรุณาแนบเอกสาร: ${missing.join(", ")}`);
      for (const f of files) {
        if (!ATTACHMENT_TYPES[f.file.type]) return setError(`${f.label}: รับเฉพาะไฟล์ PDF รูปภาพ (JPG, PNG) Excel และ Word`);
        if (f.file.size > ATTACHMENT_MAX_BYTES) return setError(`${f.label}: ไฟล์ใหญ่เกิน 10 MB`);
      }
    }

    startTransition(async () => {
      setProgress("กำลังบันทึกคำขอ...");
      const result = requestId ? await resubmitPlaceRequest(requestId, data) : await submitPlaceRequest(type, data);
      if (!result.ok) {
        setProgress(null);
        setError(result.error);
        return;
      }
      let failed = false;
      for (const [index, f] of files.entries()) {
        setProgress(`กำลังแนบเอกสาร ${index + 1} จาก ${files.length}...`);
        const upload = new FormData();
        upload.set("file", f.file);
        upload.set("entity_table", "requests");
        upload.set("entity_id", result.id);
        if (f.docTypeId) upload.set("doc_type_id", f.docTypeId);
        if (!(await uploadAttachment(upload)).ok) failed = true;
      }
      router.push(`/app/approvals/${result.id}${failed ? "?upload=failed" : ""}`);
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate data-testid="place-request-form">
      {establish ? (
        <EstablishFields initial={initial} editing={editing} />
      ) : type === "samnak_dissolve" ? (
        <DissolveFields initial={initial} editing={editing} />
      ) : type === "venue_open" ? (
        <VenueOpenFields initial={initial.venue ?? {}} editing={editing} years={years} />
      ) : (
        <VenueChangeFields
          kind={type === "venue_close" ? "close" : "move"}
          initial={initial.venue ?? {}}
          editing={editing}
          years={years}
        />
      )}

      <div className="rounded-xl border bg-card p-5" data-testid="request-documents-inputs">
        <h2 className="text-xl font-bold text-primary">เอกสารแนบ</h2>
        {editing ? (
          <p className="mt-2 text-muted-foreground">
            เอกสารที่แนบไว้ยังอยู่กับคำขอ แนบเพิ่มหรือเอาออกได้ที่หน้าคำขอ หัวข้อ เอกสารแนบ
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {docTypes.length === 0 ? (
              <p className="text-muted-foreground">
                ยังไม่มีรายการเอกสารที่กำหนดไว้สำหรับคำขอชนิดนี้ แนบเอกสารประกอบได้ในช่องด้านล่าง
              </p>
            ) : null}
            {docTypes.map((doc, index) => (
              <div key={doc.id} className="flex flex-col gap-1">
                <Label htmlFor={`doc-${doc.id}`}>
                  {index + 1}. {doc.name}
                  {doc.is_required ? <span className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (ถ้ามี)</span>}
                </Label>
                <input id={`doc-${doc.id}`} type="file" name={`doc_${doc.id}`} accept={ATTACHMENT_ACCEPT} className={fileClass} />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <Label htmlFor="doc-other">
                เอกสารอื่น <span className="font-normal text-muted-foreground">(ถ้ามี)</span>
              </Label>
              <input id="doc-other" type="file" name="doc_other" accept={ATTACHMENT_ACCEPT} className={fileClass} />
            </div>
            <p className="text-sm text-muted-foreground">
              PDF รูปภาพ Excel หรือ Word ไฟล์ละไม่เกิน 10 MB รายการละ 1 ไฟล์ แนบเพิ่มได้ในหน้าคำขอหลังยื่นแล้ว
            </p>
          </div>
        )}
      </div>

      <ErrorText>{error}</ErrorText>
      {pending && progress ? <p className="text-muted-foreground">{progress}</p> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingText="กำลังส่ง...">
          {editing ? "ส่งคำขอใหม่" : "ยื่นคำขอ"}
        </SubmitButton>
        <Button variant="outline" asChild>
          <Link href={requestId ? `/app/approvals/${requestId}` : "/app/requests"}>ยกเลิก</Link>
        </Button>
      </div>
    </form>
  );
}

function EstablishFields({ initial, editing }: { initial: PlaceRequestInitial; editing: boolean }) {
  return (
    <>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">สำนักที่ขอจัดตั้ง</h2>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="ชื่อสำนักที่ขอ" name="name" id="req-name" required defaultValue={initial.name ?? ""} maxLength={200} />
          <fieldset className="flex flex-col gap-1">
            <legend className="font-semibold">
              ประเภท<span className="text-destructive"> *</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {SAMNAK_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input type="radio" name="place_type" value={t} defaultChecked={initial.placeType === t} className="size-5" />
                  {SAMNAK_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>
          {editing && initial.temple ? (
            <LockedPick
              label="วัดที่ตั้ง"
              name="temple_id"
              item={initial.temple}
              note="เปลี่ยนวัดที่ตั้งไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่"
            />
          ) : (
            <SearchPicker
              name="temple_id"
              label="วัดที่ตั้ง"
              placeholder="พิมพ์ชื่อหรือรหัสวัด แล้วกดค้นหา"
              search={searchTemples}
              initial={initial.temple ?? null}
              required
              hint="เลือกจากทะเบียนสถานที่ ต้องเป็นวัดในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสถานที่ คำขอจะเริ่มพิจารณาที่เขตคณะสงฆ์ของวัดนี้"
            />
          )}
          <SearchPicker
            name="head_person_id"
            label="เจ้าสำนัก"
            placeholder="พิมพ์ชื่อ ฉายา หรือนามสกุล แล้วกดค้นหา"
            search={searchResponsiblePersons}
            initial={initial.head ?? null}
            required
            hint="เลือกจากทะเบียนบุคคล"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">จำนวนครูและนักเรียน แยกตามแผนก</h2>
        <p className="mt-1 text-sm text-muted-foreground">หน่วยเป็น รูป/คน แผนกที่ไม่มีให้เว้นว่างหรือใส่ 0</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse" data-testid="counts-table">
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-2 pr-3">แผนก</th>
                <th scope="col" className="py-2 pr-3">ครู</th>
                <th scope="col" className="py-2">นักเรียน</th>
              </tr>
            </thead>
            <tbody>
              {DEPARTMENTS.map((d) => (
                <tr key={d.key} className="border-b last:border-b-0">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">{d.label}</th>
                  <td className="py-2 pr-3">
                    <Input
                      name={`teachers_${d.key}`}
                      aria-label={`จำนวนครู แผนก${d.label}`}
                      inputMode="numeric"
                      maxLength={6}
                      className="w-full min-w-16 max-w-28"
                      defaultValue={initial.counts ? String(initial.counts[d.key].teachers) : ""}
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      name={`students_${d.key}`}
                      aria-label={`จำนวนนักเรียน แผนก${d.label}`}
                      inputMode="numeric"
                      maxLength={6}
                      className="w-full min-w-16 max-w-28"
                      defaultValue={initial.counts ? String(initial.counts[d.key].students) : ""}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">อาคารสถานที่ และเหตุผล</h2>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="req-buildings">
              อาคารสถานที่<span className="text-destructive"> *</span>
            </Label>
            <textarea id="req-buildings" name="buildings" className={textareaClass} defaultValue={initial.buildings ?? ""} />
            <p className="text-sm text-muted-foreground">เช่น อาคารเรียน ห้องเรียน ห้องสมุด ที่พักครูและนักเรียน</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="req-detail">
              เหตุผล<span className="text-destructive"> *</span>
            </Label>
            <textarea id="req-detail" name="detail" className={textareaClass} defaultValue={initial.detail ?? ""} />
          </div>
        </div>
      </div>
    </>
  );
}

function DissolveFields({ initial, editing }: { initial: PlaceRequestInitial; editing: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-xl font-bold text-primary">สำนักที่ขอยุบ</h2>
      <div className="mt-3 flex flex-col gap-4">
        {editing && initial.place ? (
          <LockedPick
            label="สำนักที่ขอยุบ"
            name="place_id"
            item={initial.place}
            note="เปลี่ยนสำนักที่ขอยุบไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่"
          />
        ) : (
          <SearchPicker
            name="place_id"
            label="สำนักที่ขอยุบ"
            placeholder="พิมพ์ชื่อหรือรหัสสำนัก แล้วกดค้นหา"
            search={searchSamnak}
            initial={initial.place ?? null}
            required
            hint="เลือกสำนักเรียนหรือสำนักศาสนศึกษาจากทะเบียนสถานที่ ต้องอยู่ในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสถานที่"
          />
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="req-detail">
            เหตุผล<span className="text-destructive"> *</span>
          </Label>
          <textarea id="req-detail" name="detail" className={textareaClass} defaultValue={initial.detail ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="req-plan">
            แผนรองรับนักเรียนและบุคลากร<span className="text-destructive"> *</span>
          </Label>
          <textarea id="req-plan" name="support_plan" className={textareaClass} defaultValue={initial.supportPlan ?? ""} />
          <p className="text-sm text-muted-foreground">เช่น นักเรียนย้ายไปเรียนที่สำนักใด ครูและบุคลากรไปปฏิบัติหน้าที่ที่ใด</p>
        </div>
      </div>
    </div>
  );
}
