"use client";

import Link from "next/link";
import { useState } from "react";

import { Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { SearchPicker, type PickerItem } from "@/components/search-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import {
  VENUE_LEVELS,
  VENUE_LEVEL_LABEL,
  VENUE_STATUSES,
  VENUE_STATUS_LABEL,
  VENUE_TYPES,
  VENUE_TYPE_LABEL,
  type VenueStatus,
  type VenueType,
} from "@/lib/venues";

import { saveVenue, searchVenuePlaces, searchVenues, type PlacePick } from "./actions";

export type VenueFormValue = {
  id: string;
  code: string;
  name: string;
  venue_type: VenueType;
  place_id: string;
  org_unit_id: string;
  levels: string[];
  capacity: number | null;
  status: VenueStatus;
  moved_to_venue_id: string | null;
  start_year_be: number | null;
  note: string;
};

/** ฟอร์มเพิ่มและแก้ไขสนามสอบ (venue ว่าง = เพิ่มใหม่) */
export function VenueForm({
  venue,
  units,
  place,
  movedTo,
}: {
  venue?: VenueFormValue;
  units: AccessibleOrgUnit[];
  place?: PickerItem<PlacePick> | null;
  movedTo?: PickerItem | null;
}) {
  const { state, onSubmit, pending } = useServerForm(saveVenue);
  const [type, setType] = useState<VenueType | "">(venue?.venue_type ?? "");
  const [status, setStatus] = useState<VenueStatus>(venue?.status ?? "open");
  // เลือกสถานที่ตั้งแล้ว เขตคณะสงฆ์เริ่มต้นตามสถานที่นั้น (เปลี่ยน key เพื่อให้ตัวเลือกเขตรับค่าใหม่)
  const [unit, setUnit] = useState({ key: 0, id: venue?.org_unit_id ?? null });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="id" value={venue?.id ?? ""} />

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ข้อมูลสนามสอบ</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="รหัสสนามสอบ" name="code" required defaultValue={venue?.code ?? ""} hint="ห้ามซ้ำกับสนามสอบอื่น" />
          <Field label="ชื่อสนามสอบ" name="name" required defaultValue={venue?.name ?? ""} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="venue_type">
              ประเภท<span className="text-destructive"> *</span>
            </Label>
            <select
              id="venue_type"
              name="venue_type"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as VenueType | "")}
            >
              <option value="">-- เลือกประเภท --</option>
              {VENUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {VENUE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-base font-medium">
              ชั้นที่เปิดสอบ<span className="text-destructive"> *</span>
            </legend>
            <div className="flex min-h-11 flex-wrap items-center gap-4">
              {VENUE_LEVELS.map((l) => (
                <label key={l} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="levels"
                    value={l}
                    defaultChecked={venue ? venue.levels.includes(l) : true}
                    className="size-5 accent-[var(--primary)]"
                  />
                  {VENUE_LEVEL_LABEL[l]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label="ความจุ (จำนวนผู้เข้าสอบ)"
            name="capacity"
            inputMode="numeric"
            defaultValue={venue?.capacity ?? ""}
            hint="เว้นว่างได้ถ้ายังไม่ทราบ"
          />
          <Field
            label="ปีการศึกษาที่เริ่มใช้ (พ.ศ.)"
            name="start_year_be"
            inputMode="numeric"
            defaultValue={venue?.start_year_be ?? ""}
            hint="เช่น 2569 (เว้นว่างได้)"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">สถานที่ตั้งและเขตที่สังกัด</h2>
        <div className="mt-3 flex flex-col gap-4">
          <SearchPicker<PlacePick>
            name="place_id"
            label="สถานที่ตั้ง"
            placeholder="พิมพ์ชื่อหรือรหัส วัด สำนัก สถานศึกษา อย่างน้อย 2 ตัวอักษร"
            initial={place ?? null}
            search={searchVenuePlaces}
            onPick={(item) => {
              if (item?.data) setUnit((u) => ({ key: u.key + 1, id: item.data!.org_unit_id }));
            }}
            required
            hint="เลือกจากทะเบียนสถานที่ ถ้ายังไม่มีให้เพิ่มสถานที่ก่อน เลือกแล้วระบบเติมเขตคณะสงฆ์ตามสถานที่ให้"
          />
          <div key={unit.key}>
            <p className="mb-1 text-base font-medium">
              เขตปกครองคณะสงฆ์ที่สังกัด<span className="text-destructive"> *</span>
            </p>
            <OrgUnitPicker units={units} name="org_unit_id" defaultValue={unit.id} required />
            <p className="mt-1 text-sm text-muted-foreground">เขตนี้กำหนดว่าใครมองเห็นและแก้ไขสนามสอบนี้ได้</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">สถานะ</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="status">สถานะสนามสอบ</Label>
            <select
              id="status"
              name="status"
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as VenueStatus)}
            >
              {VENUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VENUE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {status === "moved" ? (
            type ? (
              <SearchPicker
                key={type}
                name="moved_to_venue_id"
                label="สนามสอบที่ย้ายไป"
                placeholder="พิมพ์ชื่อหรือรหัสสนามสอบ อย่างน้อย 2 ตัวอักษร"
                initial={movedTo ?? null}
                search={searchVenues.bind(null, type, venue?.id ?? "")}
                hint="ต้องเป็นสนามสอบประเภทเดียวกัน (เว้นว่างได้ถ้ายังไม่ทราบ)"
              />
            ) : (
              <p className="self-end text-muted-foreground">เลือกประเภทสนามสอบก่อน จึงเลือกสนามสอบที่ย้ายไปได้</p>
            )
          ) : null}
          <Field label="หมายเหตุ" name="note" defaultValue={venue?.note ?? ""} className="sm:col-span-2" />
        </div>
      </div>

      <FormMessages state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
          {venue ? "บันทึกการแก้ไข" : "บันทึกสนามสอบ"}
        </SubmitButton>
        <Button asChild variant="outline">
          <Link href={venue ? `/app/places/venues/${venue.id}` : "/app/places/venues"}>ยกเลิก</Link>
        </Button>
      </div>
    </form>
  );
}
