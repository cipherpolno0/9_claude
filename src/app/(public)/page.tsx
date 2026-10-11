import Link from "next/link";
import { Award, BookOpenCheck, CalendarDays, ClipboardList, LogIn, Search, UserSearch } from "lucide-react";

import { NewsList } from "@/components/public/news-list";
import { calendarEvents, type CalendarEvent, type HomeStats, type PublicAnnouncement } from "@/lib/site-content";
import { fetchExamCalendar, fetchHomeStats, fetchPublicAnnouncements } from "@/lib/site-content-server";
import { findPublicMenu, site } from "@/lib/site";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

const menu = findPublicMenu("/");

// หน้านี้ถูกโหลดล่วงหน้าจากเมนูสาธารณะ จึงเป็นหน้าคงที่ที่สร้างใหม่ทุก 5 นาที (และทันทีเมื่อผู้จัดการเนื้อหาแก้ข่าวหรือปฏิทิน)
export const revalidate = 300;

const HOME_NEWS = 8;

const SHORTCUTS = [
  { href: "/registry", title: "ค้นทะเบียน", text: "สำนักเรียน วัด สถานศึกษา สนามสอบ", icon: Search },
  { href: "/exams/check", title: "ตรวจรายชื่อผู้ขอเข้าสอบ", text: "สำนักส่งรายชื่อเข้าสอบแล้วหรือยัง", icon: UserSearch },
  { href: "/exams/results", title: "ค้นผลสอบ", text: "รายชื่อผู้สอบได้ที่ประกาศแล้ว", icon: Award },
  { href: "/track", title: "ติดตามคำขอ", text: "สถานะคำขอด้วยเลขที่คำขอ", icon: ClipboardList },
  { href: "/quiz", title: "คลังข้อสอบ", text: "แบบทดสอบและบทเรียนธรรมศึกษา", icon: BookOpenCheck },
  { href: "/login", title: "เข้าสู่ระบบ", text: "สำหรับเจ้าหน้าที่และผู้มีบัญชี", icon: LogIn },
];

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

function dateRange(e: CalendarEvent) {
  return e.endsOn && e.endsOn !== e.startsOn ? `${thaiDate(e.startsOn, "short")} – ${thaiDate(e.endsOn, "short")}` : thaiDate(e.startsOn, "short");
}

function ExamCalendar({ events, yearBe }: { events: CalendarEvent[]; yearBe: number | null }) {
  const today = todayIso();
  const nextIdx = events.findIndex((e) => (e.endsOn ?? e.startsOn) >= today);
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="exam-calendar" aria-labelledby="cal-title">
      <h2 id="cal-title" className="flex items-center gap-2 text-xl font-bold text-primary">
        <CalendarDays className="size-6" aria-hidden />
        ปฏิทินงานสอบ{yearBe ? ` ปีการศึกษา ${yearBe}` : ""}
      </h2>
      {events.length === 0 ? (
        <p className="mt-3 text-muted-foreground">ยังไม่มีกำหนดการของปีการศึกษานี้</p>
      ) : (
        <ol className="mt-3 flex flex-col">
          {events.map((e, i) => {
            const past = (e.endsOn ?? e.startsOn) < today;
            const next = i === nextIdx;
            return (
              <li
                key={i}
                className={cn("flex gap-3 border-b py-2.5 last:border-b-0", past && "text-muted-foreground")}
                data-testid="calendar-event"
              >
                <span className={cn("w-28 shrink-0 font-semibold tabular-nums sm:w-36", !past && "text-primary")}>{dateRange(e)}</span>
                <span className="min-w-0">
                  <span className="block">
                    {e.title}
                    {next ? <span className="ml-2 inline-block rounded-full bg-gold px-2 py-0.5 text-sm font-semibold whitespace-nowrap text-gold-foreground">ถัดไป</span> : null}
                  </span>
                  {e.note ? <span className="block text-sm text-muted-foreground">{e.note}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Stats({ stats }: { stats: HomeStats }) {
  const tiles = [
    { label: "สำนักเรียนและสำนักศาสนศึกษา", value: stats.samnak, unit: "แห่ง", href: "/registry/samnak-rian" },
    { label: "สนามสอบที่เปิดอยู่", value: stats.venues, unit: "สนาม", href: "/registry/venues" },
    {
      label: `ผู้สมัครสอบ${stats.year_be ? ` ปี ${stats.year_be}` : "ปีปัจจุบัน"}`,
      value: stats.candidates,
      unit: "คน/รูป",
      href: "/exams/stats",
    },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-3" data-testid="home-stats">
      {tiles.map((t) => (
        <li key={t.label}>
          <Link href={t.href} prefetch={false} className="block h-full rounded-xl border bg-card p-4 hover:bg-secondary">
            <span className="block text-muted-foreground">{t.label}</span>
            <span className="mt-1 block text-3xl font-bold text-primary tabular-nums" data-testid="stat-value">
              {t.value.toLocaleString("th-TH")}
            </span>
            <span className="text-sm text-muted-foreground">{t.unit}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function HomePage() {
  const [stats, news, calendar] = await Promise.all([
    fetchHomeStats().catch((): HomeStats => ({ year_be: null, samnak: 0, venues: 0, candidates: 0 })),
    fetchPublicAnnouncements(HOME_NEWS, 0).catch((): PublicAnnouncement[] => []),
    fetchExamCalendar().catch(() => []),
  ]);
  const total = Number(news[0]?.total_count ?? 0);

  return (
    <>
      <section className="border-b bg-secondary">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{site.name}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{menu.description}</p>
          <nav aria-label="ทางลัด" className="mt-6">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="shortcuts">
              {SHORTCUTS.map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.href}>
                    <Link
                      href={s.href}
                      prefetch={false}
                      className="flex h-full flex-col items-start gap-2 rounded-xl border bg-card p-4 hover:border-primary hover:bg-background"
                    >
                      <Icon className="size-7 text-primary" aria-hidden />
                      <span className="text-lg leading-snug font-semibold text-primary">{s.title}</span>
                      <span className="text-sm text-muted-foreground">{s.text}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
        <Stats stats={stats} />
        <div className="mt-8 grid gap-6 lg:grid-cols-[3fr_2fr]">
          <section aria-labelledby="news-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <h2 id="news-title" className="text-xl font-bold text-primary">
                ข่าวประกาศ
              </h2>
              {total > HOME_NEWS ? (
                <Link href="/news" prefetch={false} className="text-primary underline underline-offset-4">
                  ข่าวทั้งหมด ({total.toLocaleString("th-TH")})
                </Link>
              ) : null}
            </div>
            <NewsList items={news} />
          </section>
          <ExamCalendar events={calendarEvents(calendar)} yearBe={stats.year_be} />
        </div>
      </div>
    </>
  );
}
