import type { Metadata } from "next";
import Link from "next/link";
import { Printer, Search, Sheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { BATCH_STATUS_LABEL } from "@/lib/exam-batches";
import { examName, templateLabel } from "@/lib/exam-forms";
import { formParam, groupByVenue } from "@/lib/exam-lists";
import { fetchList, fetchListOptions } from "@/lib/exam-lists-server";
import { fetchAccessibleUnits } from "@/lib/org-units-server";

import { UnitFilter } from "../../personnel/unit-filter";
import { SignatureBlock, VenueHeader, VenueTable } from "./form-list";
import { listQuery, readListParams } from "./params";

export const metadata: Metadata = { title: "ตรวจรายชื่อและพิมพ์บัญชี ศ." };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("th-TH");
const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default async function ExamListsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/exams");
  const p = await readListParams(await searchParams);
  const [units, options] = await Promise.all([
    fetchAccessibleUnits(),
    p.year && p.form ? fetchListOptions(p.year, p.form, p.unit) : Promise.resolve([]),
  ]);
  const venues = options.filter((o) => o.kind === "venue");
  const places = options.filter((o) => o.kind === "place");
  // สำนักหรือสนามที่เลือกไว้แต่ไม่อยู่ในตัวเลือกแล้ว (เช่น เปลี่ยนเขต) = ไม่ได้เลือก
  const venue = venues.some((o) => o.id === p.venue) ? p.venue : null;
  const place = places.some((o) => o.id === p.place) ? p.place : null;
  const rows = p.year && p.form && (venue || place) ? await fetchList(p.year, p.form, p.unit, place, venue) : [];
  const sections = groupByVenue(rows);
  const printQuery = listQuery({ ...p, venue, place });

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">ตรวจรายชื่อและพิมพ์บัญชี ศ.</h1>
          <p className="mt-1 text-muted-foreground">
            บัญชีรายชื่อผู้ขอเข้าสอบตามรูปแบบของแบบ ศ. จากบัญชีที่ส่งแล้ว (รวมที่อยู่ระหว่างรับรอง) เฉพาะเขตที่ท่านมีสิทธิ์เห็น
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/app/exams/lists/person" prefetch={false}>
              <Search aria-hidden />
              ตรวจสอบรายบุคคล
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/exams/lists/report${p.year ? `?year=${p.year}` : ""}`} prefetch={false}>
              <Sheet aria-hidden />
              รายงานสรุป
            </Link>
          </Button>
        </div>
      </div>

      {p.years.length === 0 || p.forms.length === 0 ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="lists-empty">
          ยังไม่มีรอบสมัครสอบหรือแบบ ศ. ที่ใช้งาน
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <UnitFilter units={units} value={p.unit ?? ""} param="unit" emptyLabel="ทุกเขตที่ท่านเห็นได้ (รวมเขตใต้สังกัด)" applyLabel="ใช้เขตนี้" />
          <form action="/app/exams/lists" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="list-filter">
            {p.unit ? <input type="hidden" name="unit" value={p.unit} /> : null}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">ปีการศึกษา</span>
              <select name="year" defaultValue={p.year ?? ""} className={selectClass} data-testid="list-year">
                {p.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">แบบ ศ.</span>
              <select name="form" defaultValue={p.form ? formParam(p.form) : ""} className={selectClass} data-testid="list-form">
                {p.forms.map((f) => (
                  <option key={f.id} value={formParam(f)}>
                    {templateLabel(f)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">สนามสอบ</span>
              <select name="venue" defaultValue={venue ?? ""} className={selectClass} data-testid="list-venue">
                <option value="">{venues.length ? "ทุกสนามของสำนักที่เลือก" : "ยังไม่มีบัญชีที่ส่งแล้ว"}</option>
                {venues.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} {o.name} ({n(o.candidates)} รูป/คน)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">หรือ สำนัก/สถานศึกษา</span>
              <select name="place" defaultValue={place ?? ""} className={selectClass} data-testid="list-place">
                <option value="">{places.length ? "ทุกสำนักของสนามที่เลือก" : "ยังไม่มีบัญชีที่ส่งแล้ว"}</option>
                {places.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({n(o.candidates)} รูป/คน)
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <Button type="submit">แสดงบัญชี</Button>
              <span className="text-sm text-muted-foreground">
                เปลี่ยนปีหรือแบบ ศ. แล้วกด แสดงบัญชี เพื่อโหลดรายการสนามสอบและสำนักใหม่ เลือกสนามสอบ = ทุกสำนักในสนามนั้น
              </span>
            </div>
          </form>

          {!venue && !place ? (
            <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="list-choose">
              {options.length
                ? `เลือกสนามสอบหรือสำนักแล้วกด แสดงบัญชี (มีบัญชีที่ส่งแล้ว ${n(venues.length)} สนามสอบ ${n(places.length)} สำนัก)`
                : `ยังไม่มีบัญชีที่ส่งแล้วของ ${p.form ? examName(p.form.exam_type, p.form.level) : ""} ปี ${p.year ?? ""} ในเขตนี้`}
            </p>
          ) : sections.length === 0 ? (
            <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="list-none">
              ไม่มีรายชื่อตามเงื่อนไขนี้
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p data-testid="list-total">
                  {n(sections.length)} สนามสอบ · ผู้ขอเข้าสอบ {n(rows.length)} รูป/คน
                </p>
                <Button asChild>
                  <Link href={`/app/exams/lists/print?${printQuery}`} target="_blank" prefetch={false}>
                    <Printer aria-hidden />
                    พิมพ์บัญชี (A4 แนวนอน)
                  </Link>
                </Button>
              </div>
              {p.form && p.form.signatures.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="no-signatures">
                  แบบนี้ยังไม่มีช่องลงนามท้ายบัญชี ผู้ดูแลระบบตั้งได้ที่หน้า แบบฟอร์มบัญชี ศ.
                </p>
              ) : null}
              {sections.map((s) => (
                <article key={s.venue_id} className="rounded-xl border bg-card p-4" data-testid="venue-section">
                  {p.form && p.year ? <VenueHeader form={p.form} section={s} year={p.year} /> : null}
                  <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                    {s.places.map((pl, i) => (
                      <li key={i} className="rounded-full border bg-background px-3 py-1">
                        {pl.name} {n(pl.count)} รูป/คน · {BATCH_STATUS_LABEL[pl.status]}
                        {pl.request_no ? ` · เลขที่รับ ${pl.request_no}` : ""}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 overflow-x-auto">
                    {p.form ? <VenueTable form={p.form} section={s} /> : null}
                  </div>
                  {p.form ? <SignatureBlock form={p.form} /> : null}
                </article>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
