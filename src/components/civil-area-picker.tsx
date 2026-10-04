"use client";

import { useState, useTransition } from "react";

import { selectClass } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadCivilDistricts, loadCivilSubdistricts } from "@/lib/civil-areas";
import type { CivilOption } from "@/lib/places";

/**
 * ตัวเลือกที่อยู่ตามเขตการปกครองบ้านเมือง: จังหวัด > อำเภอ > ตำบล แล้วรหัสไปรษณีย์ขึ้นเอง
 * ค่าที่ส่งกับฟอร์ม: province_code, district_code, subdistrict_code, postal_code
 * ใช้: <CivilAreaPicker provinces={...} initial={{ province, district, subdistrict, postalCode, districts, subdistricts }} />
 */
export type CivilAreaValue = {
  province: number | null;
  district: number | null;
  subdistrict: number | null;
  postalCode: string;
  districts: CivilOption[];
  subdistricts: CivilOption[];
};

export function CivilAreaPicker({
  provinces,
  initial,
  required = false,
}: {
  provinces: CivilOption[];
  initial?: Partial<CivilAreaValue>;
  required?: boolean;
}) {
  const [province, setProvince] = useState<number | null>(initial?.province ?? null);
  const [district, setDistrict] = useState<number | null>(initial?.district ?? null);
  const [subdistrict, setSubdistrict] = useState<number | null>(initial?.subdistrict ?? null);
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [districts, setDistricts] = useState<CivilOption[]>(initial?.districts ?? []);
  const [subdistricts, setSubdistricts] = useState<CivilOption[]>(initial?.subdistricts ?? []);
  const [pending, startTransition] = useTransition();
  const bangkok = province === 10;
  const mark = required ? <span className="text-destructive"> *</span> : null;

  const pickProvince = (code: number | null) => {
    setProvince(code);
    setDistrict(null);
    setSubdistrict(null);
    setPostalCode("");
    setDistricts([]);
    setSubdistricts([]);
    if (code !== null) startTransition(async () => setDistricts(await loadCivilDistricts(code)));
  };
  const pickDistrict = (code: number | null) => {
    setDistrict(code);
    setSubdistrict(null);
    setPostalCode("");
    setSubdistricts([]);
    if (code !== null) startTransition(async () => setSubdistricts(await loadCivilSubdistricts(code)));
  };
  const pickSubdistrict = (code: number | null) => {
    setSubdistrict(code);
    setPostalCode(subdistricts.find((s) => s.code === code)?.postal_code ?? "");
  };
  const toCode = (value: string) => (value ? Number(value) : null);

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="civil-area-picker" aria-busy={pending}>
      <div className="flex flex-col gap-1">
        <Label htmlFor="province_code">จังหวัด{mark}</Label>
        <select
          id="province_code"
          name="province_code"
          className={selectClass}
          value={province ?? ""}
          onChange={(e) => pickProvince(toCode(e.target.value))}
        >
          <option value="">-- เลือกจังหวัด --</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="district_code">
          {bangkok ? "เขต" : "อำเภอ"}
          {mark}
        </Label>
        <select
          id="district_code"
          name="district_code"
          className={selectClass}
          value={district ?? ""}
          disabled={province === null || districts.length === 0}
          onChange={(e) => pickDistrict(toCode(e.target.value))}
        >
          <option value="">{province === null ? "-- เลือกจังหวัดก่อน --" : pending ? "กำลังโหลด..." : `-- เลือก${bangkok ? "เขต" : "อำเภอ"} --`}</option>
          {districts.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="subdistrict_code">{bangkok ? "แขวง" : "ตำบล"}</Label>
        <select
          id="subdistrict_code"
          name="subdistrict_code"
          className={selectClass}
          value={subdistrict ?? ""}
          disabled={district === null || subdistricts.length === 0}
          onChange={(e) => pickSubdistrict(toCode(e.target.value))}
        >
          <option value="">{district === null ? `-- เลือก${bangkok ? "เขต" : "อำเภอ"}ก่อน --` : pending ? "กำลังโหลด..." : `-- เลือก${bangkok ? "แขวง" : "ตำบล"} --`}</option>
          {subdistricts.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="postal_code">รหัสไปรษณีย์</Label>
        <Input
          id="postal_code"
          name="postal_code"
          inputMode="numeric"
          maxLength={5}
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ""))}
        />
        <p className="text-sm text-muted-foreground">ขึ้นเองเมื่อเลือกตำบล แก้ไขได้ถ้าไม่ตรง</p>
      </div>
    </div>
  );
}
