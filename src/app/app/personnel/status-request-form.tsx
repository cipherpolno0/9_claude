"use client";

import { useState } from "react";

import { Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Label } from "@/components/ui/label";
import { ATTACHMENT_ACCEPT } from "@/lib/attachments/config";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { isNoticeType, statusTypeLabel, type StatusType } from "@/lib/status";

import { submitStatusRequest } from "./actions";

const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const HELP: Record<StatusType, string> = {
  transfer:
    "คำขอจะผ่านเจ้าคณะตามสายต้นทางขึ้นไปถึงหน่วยที่ทั้งสองสายมีร่วมกัน แล้วลงตามสายปลายทาง เมื่ออนุมัติครบ ระบบย้ายสังกัดและปิดตำแหน่งเดิมให้",
  resign:
    "ลาออกจากทุกตำแหน่งปกครองและทุกรายการ จศป. คำขอจะผ่านเจ้าคณะจากหน่วยต้นสังกัดขึ้นไปทุกชั้นจนถึงภาค",
  death_notice: "ต้องแนบหลักฐาน หน่วยเหนือ 1 ชั้นจะเป็นผู้กดรับทราบ แล้วระบบปิดตำแหน่งทั้งหมดให้",
  disrobe_notice: "ต้องแนบหลักฐาน หน่วยเหนือ 1 ชั้นจะเป็นผู้กดรับทราบ แล้วระบบปิดตำแหน่งทั้งหมดให้",
  other_exit_notice: "ต้องระบุเหตุผลและแนบหลักฐาน หน่วยเหนือ 1 ชั้นจะเป็นผู้กดรับทราบ แล้วระบบปิดตำแหน่งทั้งหมดให้",
};

/**
 * ฟอร์มยื่นคำขอเปลี่ยนสถานะหรือบันทึกการแจ้ง ใช้ทั้งหน้าประวัติรายบุคคล (เลขานุการ) และหน้า ประวัติของฉัน (เจ้าของประวัติ)
 * types = ชนิดที่ผู้ใช้คนนี้ยื่นได้  units = เขตปกครองของนิกายเดียวกัน สำหรับเลือกหน่วยปลายทาง
 */
export function StatusRequestForm({
  personId,
  personType,
  types,
  units,
  fromPlace,
}: {
  personId: string;
  personType: string;
  types: StatusType[];
  units: AccessibleOrgUnit[];
  fromPlace: string;
}) {
  const { state, onSubmit, pending } = useServerForm(submitStatusRequest);
  const [type, setType] = useState<StatusType | "">(types.length === 1 ? types[0] : "");
  const notice = isNoticeType(type);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate data-testid="status-request-form">
      <input type="hidden" name="person_id" value={personId} />
      <div className="flex flex-col gap-1 sm:max-w-md">
        <Label htmlFor="status-type">
          เรื่อง<span className="text-destructive"> *</span>
        </Label>
        <select
          id="status-type"
          name="type"
          className={selectClass}
          value={type}
          onChange={(e) => setType(e.target.value as StatusType | "")}
        >
          <option value="">-- เลือกเรื่อง --</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {statusTypeLabel(t, personType)}
            </option>
          ))}
        </select>
      </div>

      {type ? (
        <>
          <p className="rounded-md border border-input bg-secondary px-3 py-2 text-primary">{HELP[type]}</p>

          {type === "transfer" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="วัดหรือสำนักต้นทาง"
                  name="from_place"
                  id="status-from-place"
                  defaultValue={fromPlace}
                />
                <Field label="วัดหรือสำนักปลายทาง" name="to_place" id="status-to-place" />
              </div>
              <div>
                <p className="mb-2 font-semibold">
                  หน่วยปลายทาง<span className="text-destructive"> *</span>
                </p>
                <OrgUnitPicker units={units} name="to_unit_id" required autoSelect={false} />
                <p className="mt-1 text-sm text-muted-foreground">
                  เลือกเขตปกครองที่วัดหรือสำนักปลายทางตั้งอยู่ (ย้ายข้ามนิกายไม่ได้)
                </p>
              </div>
            </>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <ThaiDateInput
              label={notice ? "วันที่" : "วันที่มีผล"}
              name="effective_on"
              required
              hint={notice ? "วันที่เกิดเหตุ ต้องไม่เป็นวันในอนาคต" : undefined}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="status-file">
                {notice ? "หลักฐาน" : "เอกสารแนบ (ถ้ามี)"}
                {notice ? <span className="text-destructive"> *</span> : null}
              </Label>
              <input
                id="status-file"
                type="file"
                name="file"
                accept={ATTACHMENT_ACCEPT}
                className="w-full rounded-md border border-input p-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
              />
              <p className="text-sm text-muted-foreground">PDF รูปภาพ Excel หรือ Word ไม่เกิน 10 MB แนบเพิ่มได้ในหน้าคำขอ</p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="status-detail">
              เหตุผล
              {type === "resign" || type === "other_exit_notice" ? <span className="text-destructive"> *</span> : null}
            </Label>
            <textarea id="status-detail" name="detail" className={textareaClass} />
          </div>

          <FormMessages state={state} />
          <div>
            <SubmitButton pending={pending} pendingText="กำลังส่ง...">
              {notice ? "บันทึกการแจ้งและส่งให้หน่วยเหนือรับทราบ" : "ยื่นคำขอ"}
            </SubmitButton>
          </div>
        </>
      ) : null}
    </form>
  );
}
