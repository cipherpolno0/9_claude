"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { CivilAreaPicker, type CivilAreaValue } from "@/components/civil-area-picker";
import { Field, FormMessages, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { SearchPicker, type PickerItem } from "@/components/search-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SECTS, SECT_LABEL, type Sect } from "@/lib/org-units";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import {
  PLACE_STATUSES,
  PLACE_STATUS_LABEL,
  PLACE_TYPE_LABEL,
  needsParentTemple,
  needsSect,
  type CivilOption,
  type Place,
  type PlaceType,
} from "@/lib/places";

import { loadTempleAreas, savePlace, searchResponsiblePersons, searchTemples, type TemplePick } from "./actions";

/** ฟอร์มเพิ่มและแก้ไขสถานที่ (place ว่าง = เพิ่มใหม่ของประเภท type) */
export function PlaceForm({
  type,
  place,
  units,
  provinces,
  area,
  parent,
  responsible,
}: {
  type: PlaceType;
  place?: Place;
  units: AccessibleOrgUnit[];
  provinces: CivilOption[];
  /** ตัวเลือกอำเภอและตำบลของที่ตั้งปัจจุบัน (ใช้ตอนแก้ไข) */
  area?: Pick<CivilAreaValue, "districts" | "subdistricts">;
  parent?: PickerItem<TemplePick> | null;
  responsible?: PickerItem | null;
}) {
  const { state, onSubmit, pending } = useServerForm(savePlace);
  const samnak = needsParentTemple(type);
  const typeLabel = PLACE_TYPE_LABEL[type];

  // ค่าเริ่มต้นของ นิกาย เขตคณะสงฆ์ และที่ตั้ง เปลี่ยนตามวัดที่ตั้งเมื่อเลือกวัด (เปลี่ยน key เพื่อให้ช่องรับค่าใหม่)
  const [sect, setSect] = useState<Sect | "">(place?.sect ?? "");
  const [fill, setFill] = useState({
    key: 0,
    orgUnitId: place?.org_unit_id ?? null,
    houseNo: place?.house_no ?? "",
    road: place?.road ?? "",
    area: {
      province: place?.province_code ?? null,
      district: place?.district_code ?? null,
      subdistrict: place?.subdistrict_code ?? null,
      postalCode: place?.postal_code ?? "",
      districts: area?.districts ?? [],
      subdistricts: area?.subdistricts ?? [],
    } as CivilAreaValue,
  });
  const [, startTransition] = useTransition();

  const pickTemple = (item: PickerItem<TemplePick> | null) => {
    const temple = item?.data;
    if (!temple) return;
    setSect(temple.sect ?? "");
    startTransition(async () => {
      const lists = await loadTempleAreas(temple.district_code, temple.province_code);
      setFill((f) => ({
        key: f.key + 1,
        orgUnitId: temple.org_unit_id,
        houseNo: temple.house_no,
        road: temple.road,
        area: {
          province: temple.province_code,
          district: temple.district_code,
          subdistrict: temple.subdistrict_code,
          postalCode: temple.postal_code,
          ...lists,
        },
      }));
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="id" value={place?.id ?? ""} />
      <input type="hidden" name="place_type" value={type} />

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ข้อมูล{typeLabel}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="รหัส" name="code" required defaultValue={place?.code ?? ""} hint="ห้ามซ้ำกับรายการอื่นในทะเบียน" />
          <Field label={`ชื่อ${typeLabel}`} name="name" required defaultValue={place?.name ?? ""} />
          {samnak ? (
            <div className="sm:col-span-2">
              <SearchPicker<TemplePick>
                name="parent_place_id"
                label="วัดที่ตั้ง"
                placeholder="พิมพ์ชื่อหรือรหัสวัด อย่างน้อย 2 ตัวอักษร"
                initial={parent ?? null}
                search={searchTemples}
                onPick={pickTemple}
                required
                hint="เลือกวัดแล้ว ระบบจะเติมนิกาย เขตคณะสงฆ์ และที่ตั้งตามวัดให้ แก้ไขที่ตั้งได้ถ้าต่างจากวัด"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="sect">
              นิกาย{needsSect(type) ? <span className="text-destructive"> *</span> : null}
            </Label>
            {samnak ? <input type="hidden" name="sect" value={sect} /> : null}
            <select
              id="sect"
              name={samnak ? undefined : "sect"}
              className={selectClass}
              value={sect}
              disabled={samnak}
              onChange={(e) => setSect(e.target.value as Sect | "")}
            >
              <option value="">{samnak ? "-- ตามวัดที่ตั้ง --" : needsSect(type) ? "-- เลือกนิกาย --" : "-- ไม่ระบุ --"}</option>
              {SECTS.map((s) => (
                <option key={s} value={s}>
                  {SECT_LABEL[s]}
                </option>
              ))}
            </select>
            {samnak ? <p className="text-sm text-muted-foreground">นิกายของสำนักเป็นไปตามวัดที่ตั้ง</p> : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="status">สถานะ</Label>
            <select id="status" name="status" className={selectClass} defaultValue={place?.status ?? "open"}>
              {PLACE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PLACE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <ThaiDateInput label="วันที่จัดตั้ง" name="established_on" defaultValue={place?.established_on} />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5" key={`address-${fill.key}`}>
        <h2 className="text-xl font-bold text-primary">ที่ตั้ง</h2>
        <p className="text-muted-foreground">ตามเขตการปกครองบ้านเมือง</p>
        <div className="mt-3 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="เลขที่ หมู่" name="house_no" defaultValue={fill.houseNo} />
            <Field label="ถนน ซอย" name="road" defaultValue={fill.road} />
          </div>
          <CivilAreaPicker provinces={provinces} initial={fill.area} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="ละติจูด"
              name="latitude"
              inputMode="decimal"
              defaultValue={place?.latitude ?? ""}
              hint="เช่น 13.761039 (เว้นว่างได้)"
            />
            <Field label="ลองจิจูด" name="longitude" inputMode="decimal" defaultValue={place?.longitude ?? ""} hint="เช่น 100.500531" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5" key={`unit-${fill.key}`}>
        <h2 className="text-xl font-bold text-primary">เขตปกครองคณะสงฆ์ที่สังกัด</h2>
        <div className="mt-3">
          <OrgUnitPicker units={units} name="org_unit_id" defaultValue={fill.orgUnitId} required />
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกให้ถึงตำบลถ้าทราบ เขตนี้กำหนดว่าใครมองเห็นและแก้ไขรายการนี้ได้ และต้องเป็นนิกายเดียวกับสถานที่
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">การติดต่อและผู้รับผิดชอบ</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="โทรศัพท์สำนักงาน" name="office_phone" inputMode="tel" defaultValue={place?.office_phone ?? ""} />
          <Field label="อีเมล" name="email" type="email" defaultValue={place?.email ?? ""} />
          <div className="sm:col-span-2">
            <SearchPicker
              name="responsible_person_id"
              label="ผู้รับผิดชอบ"
              placeholder="พิมพ์ชื่อหรือฉายา อย่างน้อย 2 ตัวอักษร"
              initial={responsible ?? null}
              search={searchResponsiblePersons}
              hint="เลือกจากทะเบียนบุคคลที่ท่านมีสิทธิ์ดู (เว้นว่างได้)"
            />
          </div>
          <Field label="หมายเหตุ" name="note" defaultValue={place?.note ?? ""} className="sm:col-span-2" />
        </div>
      </div>

      <FormMessages state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
          {place ? "บันทึกการแก้ไข" : `บันทึก${typeLabel}`}
        </SubmitButton>
        <Button asChild variant="outline">
          <Link href={place ? `/app/places/${place.id}` : `/app/places?type=${type}`}>ยกเลิก</Link>
        </Button>
      </div>
    </form>
  );
}
