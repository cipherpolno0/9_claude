import type { Metadata } from "next";

import { fetchPublicProvinces } from "@/lib/registry-server";
import { findPublicMenu } from "@/lib/site";
import { currentYearBe, fetchPublicRequestSummary, fetchPublicRequestYears } from "@/lib/track-server";

import { SummaryTable } from "./summary-table";
import { TrackForms } from "./track-forms";

const menu = findPublicMenu("/track");

export const metadata: Metadata = { title: menu.title, description: menu.description };
// หน้านี้ถูกโหลดล่วงหน้าจากเมนูของทุกหน้าสาธารณะ จึงเป็นหน้าคงที่ที่สร้างใหม่เป็นระยะ (ข้อมูลมาจากแคช 5 นาที ไม่อ่านฐานข้อมูลทุกครั้งที่เปิด)
export const revalidate = 300;

export default async function TrackPage() {
  const year = currentYearBe();
  const [provinces, years, summary] = await Promise.all([
    fetchPublicProvinces().catch(() => []),
    fetchPublicRequestYears().catch(() => [year]),
    fetchPublicRequestSummary(year).catch(() => []),
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-1 text-muted-foreground">
        ติดตามสถานะคำขอจัดตั้งและยุบสำนักเรียน สำนักศาสนศึกษา และคำขอเปิด ปิด ย้ายสนามสอบ
        ว่าอยู่ที่ขั้นใด ยื่นเมื่อใด และผลการพิจารณาเป็นอย่างไร
      </p>

      <div className="mt-6">
        <TrackForms provinces={provinces} years={years} />
      </div>

      <div className="mt-8 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">สรุปจำนวนคำขอ ปี {year}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          นับตามปี พ.ศ. ที่ยื่นคำขอ แยกตามภาคของคณะสงฆ์ที่สังกัด ชนิดคำขอ และสถานะ ข้อมูลปรับภายใน 5 นาที
        </p>
        <div className="mt-3">
          <SummaryTable rows={summary} year={year} />
        </div>
      </div>
    </section>
  );
}
