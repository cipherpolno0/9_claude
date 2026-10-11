import type { Metadata } from "next";
import Link from "next/link";

import { selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { requireSiteContentManager } from "@/lib/auth/guards";
import { calendarEvents } from "@/lib/site-content";
import { fetchCalendarEvents, fetchExamCalendar } from "@/lib/site-content-server";
import { thaiDate } from "@/lib/thai";
import { fetchAcademicYears, pickYear } from "@/lib/venues-server";
import { cn } from "@/lib/utils";

import { ActiveToggle, CalendarEventForm } from "../site-forms";

export const metadata: Metadata = { title: "ปฏิทินงานสอบ" };
export const dynamic = "force-dynamic";

/** ปฏิทินงานสอบบนหน้าแรก: วันจากรอบสมัครสอบขึ้นอัตโนมัติ + รายการที่เพิ่มเอง (ผู้ดูแลระบบและส่วนกลาง) */
export default async function CalendarAdminPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requireSiteContentManager();
  const years = await fetchAcademicYears();
  const year = pickYear(years, (await searchParams).year);
  const [events, preview] = await Promise.all([year ? fetchCalendarEvents(year.id) : Promise.resolve([]), fetchExamCalendar().catch(() => [])]);
  const current = years.find((y) => y.is_current);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/admin" className="text-primary underline underline-offset-4">
          ← ผู้ดูแลระบบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ปฏิทินงานสอบ</h1>
      <p className="mt-1 text-muted-foreground">
        หน้าแรกแสดงปฏิทินของปีการศึกษาปัจจุบัน วันเปิดรับ ปิดรับ วันสอบ และวันประกาศผล ขึ้นจากรอบสมัครสอบให้เอง (แก้ที่หน้า รอบสมัครสอบ)
        ที่นี่ใช้เพิ่มรายการอื่น เช่น วันส่งข้อสอบ วันประชุมชี้แจง
      </p>
      {!year ? (
        <p className="mt-6 text-muted-foreground">ยังไม่มีปีการศึกษา (ผู้ดูแลระบบเพิ่มได้ที่หน้า บทบาทและค่าตั้ง)</p>
      ) : (
        <>
          <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              ปีการศึกษา
              <select name="year" defaultValue={year.year_be} className={selectClass}>
                {years.map((y) => (
                  <option key={y.id} value={y.year_be}>
                    {y.year_be}
                    {y.is_current ? " (ปัจจุบัน)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline">
              เปลี่ยนปี
            </Button>
          </form>

          <section className="mt-6 rounded-xl border bg-card p-5" data-testid="open-new-calendar">
            <h2 className="text-lg font-bold text-primary">เพิ่มรายการในปีการศึกษา {year.year_be}</h2>
            <div className="mt-4">
              <CalendarEventForm yearId={year.id} />
            </div>
          </section>

          <h2 className="mt-6 text-xl font-bold text-primary">รายการที่เพิ่มเอง ปีการศึกษา {year.year_be}</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-muted-foreground">ยังไม่มีรายการ</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2" data-testid="calendar-rows">
              {events.map((e) => (
                <li key={e.id} className={cn("rounded-xl border bg-card p-4", !e.is_active && "opacity-70")} data-testid="calendar-row">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p>
                      <span className="font-semibold">
                        {thaiDate(e.starts_on, "short")}
                        {e.ends_on ? ` – ${thaiDate(e.ends_on, "short")}` : ""}
                      </span>{" "}
                      {e.title}
                      {!e.is_active ? <span className="ml-2 text-sm text-muted-foreground">(ปิดใช้งาน)</span> : null}
                      {e.note ? <span className="block text-sm text-muted-foreground">{e.note}</span> : null}
                    </p>
                    <ActiveToggle kind="calendar" id={e.id} active={e.is_active} />
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold text-primary">แก้ไข</summary>
                    <div className="mt-3">
                      <CalendarEventForm yearId={year.id} item={e} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-8 text-xl font-bold text-primary">ตัวอย่างบนหน้าแรก (ปีการศึกษาปัจจุบัน {current?.year_be ?? "-"})</h2>
          <ul className="mt-2 rounded-xl border bg-card p-4" data-testid="calendar-preview">
            {calendarEvents(preview).map((e, i) => (
              <li key={i} className="border-b py-1.5 last:border-b-0">
                <span className="font-semibold">
                  {thaiDate(e.startsOn, "short")}
                  {e.endsOn && e.endsOn !== e.startsOn ? ` – ${thaiDate(e.endsOn, "short")}` : ""}
                </span>{" "}
                {e.title}
              </li>
            ))}
            {preview.length === 0 ? <li className="text-muted-foreground">ยังไม่มีกำหนดการ</li> : null}
          </ul>
        </>
      )}
    </section>
  );
}
