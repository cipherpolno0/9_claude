"use client";

import { useState } from "react";

import { Field, selectClass } from "@/components/form";
import { SearchPicker, type PickerItem } from "@/components/search-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { thaiDate } from "@/lib/thai";
import {
  VENUE_LEVELS,
  VENUE_LEVEL_LABEL,
  VENUE_TYPES,
  VENUE_TYPE_LABEL,
  requestDeadlinePassed,
  type AcademicYear,
  type VenueType,
} from "@/lib/venues";

import { searchResponsiblePersons } from "../places/actions";
import { searchVenuePlaces } from "../places/venues/actions";
import { searchOpenVenues, type VenuePick } from "./actions";

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export type VenueRequestInitial = {
  name?: string;
  venueType?: VenueType | null;
  place?: PickerItem | null;
  levels?: string[];
  capacity?: number | null;
  chair?: PickerItem | null;
  receiver?: PickerItem | null;
  year?: number | null;
  detail?: string;
  venue?: PickerItem<VenuePick> | null;
  replacement?: PickerItem | null;
  toPlace?: PickerItem | null;
};

export type YearOption = Pick<AcademicYear, "year_be" | "is_current" | "request_deadline">;

export function LockedPick({ label, name, item, note }: { label: string; name: string; item: PickerItem; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-semibold">{label}</p>
      <input type="hidden" name={name} value={item.id} />
      <div className="rounded-md border border-input bg-muted px-3 py-2">
        <span className="font-semibold">{item.label}</span>
        {item.detail ? <span className="block text-sm text-muted-foreground">{item.detail}</span> : null}
      </div>
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

/** ตัวเลือกปีการศึกษา พร้อมวันปิดรับคำขอของปีที่เลือก (ปีที่ปิดรับแล้วเลือกไม่ได้เมื่อยื่นใหม่) */
function YearSelect({
  name,
  label,
  years,
  initial,
  editing,
}: {
  name: string;
  label: string;
  years: YearOption[];
  initial?: number | null;
  editing: boolean;
}) {
  const open = (y: YearOption) => editing || !requestDeadlinePassed(y);
  const fallback = years.find((y) => y.is_current && open(y)) ?? years.find(open);
  const [value, setValue] = useState(String(initial ?? fallback?.year_be ?? ""));
  const picked = years.find((y) => String(y.year_be) === value);
  return (
    <div className="flex flex-col gap-1 sm:max-w-xs">
      <Label htmlFor={`req-${name}`}>
        {label}
        <span className="text-destructive"> *</span>
      </Label>
      <select id={`req-${name}`} name={name} className={selectClass} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">-- เลือกปีการศึกษา --</option>
        {years.map((y) => (
          <option key={y.year_be} value={y.year_be} disabled={!open(y)}>
            {y.year_be}
            {y.is_current ? " (ปีปัจจุบัน)" : ""}
            {!open(y) ? " (ปิดรับคำขอแล้ว)" : ""}
          </option>
        ))}
      </select>
      {years.length === 0 ? (
        <p className="text-sm text-destructive">ยังไม่มีปีการศึกษาในระบบ ให้ผู้ดูแลระบบเพิ่มที่หน้า บทบาทและค่าตั้ง ก่อน</p>
      ) : picked?.request_deadline ? (
        <p className="text-sm text-muted-foreground" data-testid="deadline-hint">
          ปิดรับคำขอสนามสอบของปีการศึกษา {picked.year_be} วันที่ {thaiDate(picked.request_deadline)}
        </p>
      ) : null}
    </div>
  );
}

export function VenueOpenFields({
  initial,
  editing,
  years,
}: {
  initial: VenueRequestInitial;
  editing: boolean;
  years: YearOption[];
}) {
  return (
    <>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">สนามสอบที่ขอเปิด</h2>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="ชื่อสนามสอบ" name="name" id="req-name" required defaultValue={initial.name ?? ""} maxLength={200} />
          <fieldset className="flex flex-col gap-1">
            <legend className="font-semibold">
              ประเภท<span className="text-destructive"> *</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {VENUE_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input type="radio" name="venue_type" value={t} defaultChecked={initial.venueType === t} className="size-5" />
                  {VENUE_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>
          {editing && initial.place ? (
            <LockedPick
              label="สถานที่ตั้ง"
              name="place_id"
              item={initial.place}
              note="เปลี่ยนสถานที่ตั้งไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่"
            />
          ) : (
            <SearchPicker
              name="place_id"
              label="สถานที่ตั้ง"
              placeholder="พิมพ์ชื่อหรือรหัสสถานที่ แล้วกดค้นหา"
              search={searchVenuePlaces}
              initial={initial.place ?? null}
              required
              hint="เลือกจากทะเบียนสถานที่ ต้องอยู่ในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสนามสอบ คำขอจะเริ่มพิจารณาที่เขตคณะสงฆ์ของสถานที่นี้"
            />
          )}
          <fieldset className="flex flex-col gap-1">
            <legend className="font-semibold">
              ชั้นที่เปิดสอบ<span className="text-destructive"> *</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {VENUE_LEVELS.map((l) => (
                <label key={l} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="levels"
                    value={l}
                    defaultChecked={(initial.levels ?? []).includes(l)}
                    className="size-5"
                  />
                  {VENUE_LEVEL_LABEL[l]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="req-capacity">
                จำนวนผู้เข้าสอบโดยประมาณ<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="req-capacity"
                name="capacity"
                inputMode="numeric"
                maxLength={6}
                className="max-w-40"
                defaultValue={initial.capacity ?? ""}
              />
              <p className="text-sm text-muted-foreground">หน่วยเป็น รูป/คน</p>
            </div>
            <YearSelect name="start_year_be" label="ปีการศึกษาที่เริ่ม" years={years} initial={initial.year} editing={editing} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ประธานสนามสอบและผู้รับข้อสอบที่เสนอ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          เมื่ออนุมัติขั้นสุดท้าย ระบบจะบันทึกเป็นรายชื่อของปีการศึกษาที่เริ่ม ที่อยู่จัดส่งข้อสอบและเบอร์ติดต่อกรอกเพิ่มได้ที่หน้าสนามสอบ
        </p>
        <div className="mt-3 flex flex-col gap-4">
          <SearchPicker
            name="chair_person_id"
            label="ประธานสนามสอบ"
            placeholder="พิมพ์ชื่อ ฉายา หรือนามสกุล แล้วกดค้นหา"
            search={searchResponsiblePersons}
            initial={initial.chair ?? null}
            required
            hint="เลือกจากทะเบียนบุคคล"
          />
          <SearchPicker
            name="receiver_person_id"
            label="ผู้รับข้อสอบ"
            placeholder="พิมพ์ชื่อ ฉายา หรือนามสกุล แล้วกดค้นหา"
            search={searchResponsiblePersons}
            initial={initial.receiver ?? null}
            required
            hint="เลือกจากทะเบียนบุคคล"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="req-detail">
              หมายเหตุ <span className="font-normal text-muted-foreground">(ถ้ามี)</span>
            </Label>
            <textarea id="req-detail" name="detail" className={textareaClass} defaultValue={initial.detail ?? ""} />
          </div>
        </div>
      </div>
    </>
  );
}

/** ฟอร์มขอปิด (kind = close) และขอย้าย (kind = move) */
export function VenueChangeFields({
  kind,
  initial,
  editing,
  years,
}: {
  kind: "close" | "move";
  initial: VenueRequestInitial;
  editing: boolean;
  years: YearOption[];
}) {
  const [venue, setVenue] = useState<PickerItem<VenuePick> | null>(initial.venue ?? null);
  const word = kind === "close" ? "ขอปิด" : "ขอย้าย";
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-xl font-bold text-primary">สนามสอบที่{word}</h2>
      <div className="mt-3 flex flex-col gap-4">
        {editing && initial.venue ? (
          <LockedPick
            label={`สนามสอบที่${word}`}
            name="venue_id"
            item={initial.venue}
            note="เปลี่ยนสนามสอบของคำขอไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่"
          />
        ) : (
          <SearchPicker
            name="venue_id"
            label={`สนามสอบที่${word}`}
            placeholder="พิมพ์ชื่อหรือรหัสสนามสอบ แล้วกดค้นหา"
            search={(q) => searchOpenVenues(q)}
            initial={initial.venue ?? null}
            onPick={setVenue}
            required
            hint="เลือกสนามสอบที่เปิดอยู่จากทะเบียนสนามสอบ ต้องอยู่ในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสนามสอบ"
          />
        )}

        {kind === "close" ? (
          <SearchPicker
            key={venue?.id ?? "none"}
            name="replacement_venue_id"
            label="สนามสอบที่จะรับผู้เข้าสอบแทน"
            placeholder="พิมพ์ชื่อหรือรหัสสนามสอบ แล้วกดค้นหา"
            search={(q) => searchOpenVenues(q, venue?.data?.venue_type, venue?.id)}
            initial={venue?.id === initial.venue?.id ? (initial.replacement ?? null) : null}
            required
            hint="ต้องเป็นสนามสอบประเภทเดียวกันที่เปิดอยู่"
          />
        ) : (
          <>
            {venue?.data?.place_name ? (
              <p data-testid="current-place">
                <span className="font-semibold">สถานที่ตั้งปัจจุบัน:</span> {venue.data.place_name}
              </p>
            ) : null}
            <SearchPicker
              name="to_place_id"
              label="สถานที่ตั้งใหม่"
              placeholder="พิมพ์ชื่อหรือรหัสสถานที่ แล้วกดค้นหา"
              search={searchVenuePlaces}
              initial={initial.toPlace ?? null}
              required
              hint="เลือกจากทะเบียนสถานที่ ต้องอยู่ในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสนามสอบ"
            />
            <YearSelect name="effective_year_be" label="ปีการศึกษาที่มีผล" years={years} initial={initial.year} editing={editing} />
          </>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="req-detail">
            เหตุผล<span className="text-destructive"> *</span>
          </Label>
          <textarea id="req-detail" name="detail" className={textareaClass} defaultValue={initial.detail ?? ""} />
        </div>
      </div>
    </div>
  );
}
