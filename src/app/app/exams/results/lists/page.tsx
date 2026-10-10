import type { Metadata } from "next";
import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { examName } from "@/lib/exam-forms";
import { RESULT_STATUS_LABEL, passSections } from "@/lib/exam-results";
import { fetchPassList, fetchPassListOptions, fetchResultForms } from "@/lib/exam-results-server";
import { fetchAccessibleUnits } from "@/lib/org-units-server";

import { UnitFilter } from "../../../personnel/unit-filter";
import { PassListSheet } from "./pass-list";
import { passListQuery, readPassListParams } from "./params";

export const metadata: Metadata = { title: "บัญชีผู้สอบได้" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("th-TH");
const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** บัญชีรายชื่อผู้สอบได้ ศ.๔ ศ.๘: รอบ > เขต > สำนักหรือสนามสอบ แสดงตามแบบจริง พิมพ์และส่งออก Excel */
export default async function PassListsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireMenu("/app/exams");
  const p = await readPassListParams(await searchParams, ctx.canManageExamRounds);
  const [units, options, forms] = await Promise.all([
    fetchAccessibleUnits(),
    p.round ? fetchPassListOptions(p.round.id, p.unit) : Promise.resolve([]),
    fetchResultForms(),
  ]);
  const venues = options.filter((o) => o.kind === "venue");
  const places = options.filter((o) => o.kind === "place");
  const venue = venues.some((o) => o.id === p.venue) ? p.venue : null;
  const place = places.some((o) => o.id === p.place) ? p.place : null;
  const rows = p.round && (venue || place) ? await fetchPassList(p.round.id, p.unit, place, venue) : [];
  const round = p.round;
  const sections = round ? passSections(rows, round.exam_type, round.level, p.by) : [];
  const form = round ? (forms.find((f) => f.exam_type === round.exam_type) ?? null) : null;
  const draft = round?.result_status !== "published";
  const query = passListQuery({ ...p, place, venue });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>
        {ctx.canManageExamRounds ? (
          <>
            {" / "}
            <Link href="/app/exams/results" className="text-primary underline underline-offset-4">
              ผลสอบ
            </Link>
          </>
        ) : null}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">บัญชีผู้สอบได้ ศ.๔ ศ.๘</h1>
      <p className="mt-1 text-muted-foreground">
        บัญชีรายชื่อผู้สอบประโยคได้ตามแบบ ศ.๔ (นักธรรม) และ ศ.๘ (ธรรมศึกษา แยกช่วงชั้น) ของสำนักหรือสนามสอบในเขตที่ท่านมีสิทธิ์เห็น
        {ctx.canManageExamRounds ? " ส่วนกลางดูรอบที่ยังไม่ประกาศได้ (มีป้าย ร่าง)" : " เฉพาะรอบที่ประกาศผลแล้ว"}
      </p>

      {p.rounds.length === 0 || !round ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="pass-empty">
          ยังไม่มีรอบที่ประกาศผลสอบ
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <UnitFilter units={units} value={p.unit ?? ""} param="unit" emptyLabel="ทุกเขตที่ท่านเห็นได้ (รวมเขตใต้สังกัด)" applyLabel="ใช้เขตนี้" />
          <form action="/app/exams/results/lists" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="pass-filter">
            {p.unit ? <input type="hidden" name="unit" value={p.unit} /> : null}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">รอบ (ปี ประเภท ชั้น)</span>
              <select name="round" defaultValue={round.id} className={selectClass} data-testid="pass-round">
                {p.rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {examName(r.exam_type, r.level)} {r.year_be}
                    {r.result_status === "published" ? "" : " (ร่าง)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">สนามสอบ</span>
              <select name="venue" defaultValue={venue ?? ""} className={selectClass} data-testid="pass-venue">
                <option value="">{venues.length ? "ทุกสนามของสำนักที่เลือก" : "ไม่มีข้อมูล"}</option>
                {venues.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} {o.name} (สอบได้ {n(o.passed)} จาก {n(o.candidates)})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">หรือ สำนัก/สถานศึกษา</span>
              <select name="place" defaultValue={place ?? ""} className={selectClass} data-testid="pass-place">
                <option value="">{places.length ? "ทุกสำนักของสนามที่เลือก" : "ไม่มีข้อมูล"}</option>
                {places.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} (สอบได้ {n(o.passed)} จาก {n(o.candidates)})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">แยกบัญชีตาม</span>
              <select name="by" defaultValue={p.by} className={selectClass} data-testid="pass-by">
                <option value="place">สำนัก (ตามแบบ)</option>
                <option value="venue">สนามสอบ</option>
              </select>
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">แสดงบัญชี</Button>
            </div>
          </form>

          {!venue && !place ? (
            <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="pass-choose">
              {options.length ? "เลือกสนามสอบหรือสำนักแล้วกด แสดงบัญชี" : "ยังไม่มีบัญชีของรอบนี้ในเขตที่เลือก"}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p data-testid="pass-total">
                  {n(sections.length)} บัญชี · สถานะผล {RESULT_STATUS_LABEL[round.result_status ?? "draft"]}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <a href={`/app/exams/results/lists/export?${query}`} download>
                      <Download aria-hidden />
                      ส่งออก Excel
                    </a>
                  </Button>
                  <Button asChild>
                    <Link href={`/app/exams/results/lists/print?${query}`} target="_blank" prefetch={false}>
                      <Printer aria-hidden />
                      พิมพ์บัญชี (A4)
                    </Link>
                  </Button>
                </div>
              </div>
              {form && form.signatures.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="no-result-signatures">
                  แบบ {form.code} ยังไม่มีช่องลงนาม ผู้ดูแลระบบตั้งได้ที่หน้า แบบฟอร์มบัญชี ศ.
                </p>
              ) : null}
              {sections.map((s) => (
                <article key={s.key} className="rounded-xl border bg-card p-4">
                  <PassListSheet
                    section={s}
                    form={form}
                    type={round.exam_type}
                    year={round.year_be}
                    announcedOn={round.results_announced_on ?? null}
                    draft={draft}
                  />
                </article>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
