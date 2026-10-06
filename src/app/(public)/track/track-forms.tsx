import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLACE_REQUEST_TITLE, PLACE_REQUEST_TYPES } from "@/lib/place-requests";
import type { CivilOption } from "@/lib/places";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * ฟอร์มค้นหาของหน้าติดตามคำขอ: ค้นด้วยเลขที่คำขอ หรือเลือกชนิดคำขอ จังหวัด และปี
 * เป็นฟอร์มแบบ GET ธรรมดา (ไม่ต้องใช้สคริปต์) ส่งไปที่ /track/search
 */
export function TrackForms({
  provinces,
  years,
  values = {},
}: {
  provinces: CivilOption[];
  years: number[];
  values?: { no?: string; type?: string; province?: string; year?: string };
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action="/track/search" method="get" className="rounded-xl border bg-card p-5" data-testid="track-by-no">
        <h2 className="text-xl font-bold text-primary">ค้นด้วยเลขที่คำขอ</h2>
        <div className="mt-3 flex flex-col gap-1">
          <Label htmlFor="track-no">เลขที่คำขอ</Label>
          <Input id="track-no" name="no" defaultValue={values.no ?? ""} placeholder="เช่น ESTAB-2569-0001" maxLength={30} required />
          <p className="text-sm text-muted-foreground">เลขที่คำขออยู่ที่หน้าคำขอและในแบบพิมพ์คำขอ</p>
        </div>
        <div className="mt-3">
          <Button type="submit">
            <Search aria-hidden />
            ติดตามสถานะ
          </Button>
        </div>
      </form>

      <form action="/track/search" method="get" className="rounded-xl border bg-card p-5" data-testid="track-by-filter">
        <h2 className="text-xl font-bold text-primary">ค้นจากชนิดคำขอ จังหวัด และปี</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="track-type">ชนิดคำขอ</Label>
            <select id="track-type" name="type" className={selectClass} defaultValue={values.type ?? ""}>
              <option value="">ทุกชนิด</option>
              {PLACE_REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PLACE_REQUEST_TITLE[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="track-province">จังหวัด</Label>
            <select id="track-province" name="province" className={selectClass} defaultValue={values.province ?? ""}>
              <option value="">ทุกจังหวัด</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="track-year">ปี พ.ศ. ที่ยื่น</Label>
            <select id="track-year" name="year" className={selectClass} defaultValue={values.year ?? String(years[0] ?? "")}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <Button type="submit" variant="outline">
            <Search aria-hidden />
            แสดงรายการ
          </Button>
        </div>
      </form>
    </div>
  );
}
