/**
 * บัญชีรายชื่อผู้สอบได้ตามแบบจริง ศ.๔ (นักธรรม) / ศ.๘ (ธรรมศึกษา) ของหนึ่งสำนักหรือหนึ่งสนามสอบ
 * ใช้ทั้งหน้าจอและหน้าพิมพ์ จึงไม่มี hook: ส่งตัวแปลงเลข d เข้ามา
 * อายุ พรรษา พิมพ์เป็น * ตามแบบจริง (ไม่เปิดเผยตัวเลข)
 */

import type { ExamType } from "@/lib/exam-forms";
import { certSort, dashZero, passPercent, personUnit, type PassSection, type ResultForm } from "@/lib/exam-results";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

type Digits = (v: string | number) => string;
const plain: Digits = (v) => String(v);

export function passColumns(type: ExamType): string[] {
  return type === "nak_tham"
    ? ["เลขที่", "ชื่อ", "ฉายา", "นามสกุล", "อายุ", "พรรษา", "สังกัดวัด", "เขต", "หมายเหตุ"]
    : ["เลขที่", "ชื่อ", "นามสกุล", "อายุ", "องค์กร / สถานศึกษา", "สังกัดวัด", "หมายเหตุ"];
}

export function passCells(type: ExamType, r: PassSection["rows"][number]): string[] {
  const name = [r.title, r.first_name].filter(Boolean).join("");
  const star = (v: number | null) => (v === null || v === undefined ? "" : "*");
  return type === "nak_tham"
    ? [r.certificate_no ?? "", name, r.monastic_name, r.last_name, star(r.age), star(r.phansa), r.vals.temple_name ?? "", r.vals.temple_district ?? "", r.note ?? ""]
    : [r.certificate_no ?? "", name, r.last_name, star(r.age), r.vals.org_name ?? "", r.vals.temple_name ?? "", r.note ?? ""];
}

export function summaryLine(type: ExamType, s: PassSection["summary"], d: Digits = plain): string {
  const u = personUnit(type);
  return (
    `ส่งสอบ ${d(dashZero(s.sent))} ${u} ขาดสอบ ${d(dashZero(s.absent))} ${u} คงสอบ ${d(dashZero(s.remaining))} ${u} ` +
    `สอบได้ ${d(dashZero(s.passed))} ${u} สอบตก ${d(dashZero(s.failed))} ${u}  (${d(passPercent(s.passed, s.remaining))}%)`
  );
}

export function PassListSheet({
  section,
  form,
  type,
  year,
  announcedOn,
  draft,
  d = plain,
  print = false,
}: {
  section: PassSection;
  form: ResultForm | null;
  type: ExamType;
  year: number;
  announcedOn: string | null;
  draft: boolean;
  d?: Digits;
  print?: boolean;
}) {
  const passed = section.rows.filter((r) => r.result === "passed").sort(certSort);
  const cols = passColumns(type);
  const cell = cn("border border-black align-top", print ? "px-1 py-0.5" : "px-2 py-1");
  const code = form?.code ?? (type === "nak_tham" ? "ศ.๔" : "ศ.๘");
  return (
    <div data-testid="pass-sheet">
      <p className="text-right text-base">{d(code.replace(".", ". "))}</p>
      {draft ? (
        <p className="mx-auto w-fit rounded border border-red-600 px-2 text-sm font-semibold text-red-700" data-testid="draft-mark">
          ร่าง ยังไม่ประกาศผล
        </p>
      ) : null}
      <div className="mt-2 text-center font-bold">
        <p className="text-xl">{d(section.title)}</p>
        <p className="mt-1 text-lg">ในสนามหลวง พ.ศ. {d(year)}</p>
        <p className="mt-1 text-lg">{d(section.heading)}</p>
        <p className="mt-4 text-base" data-testid="pass-summary">
          {summaryLine(type, section.summary, d)}
        </p>
      </div>
      <div className={print ? "" : "overflow-x-auto"}>
        <table className={cn("mt-3 w-full border-collapse border-t-[3px] border-double border-black", print ? "text-[12px]" : "min-w-[44rem] text-sm")} data-testid="pass-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} scope="col" className={cn(cell, "text-center font-bold")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {passed.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className={cn(cell, "text-center")}>
                  ไม่มีผู้สอบได้
                </td>
              </tr>
            ) : (
              passed.map((r) => (
                <tr key={r.candidate_id} data-testid="pass-row">
                  {passCells(type, r).map((v, i) => (
                    <td key={i} className={cn(cell, cols[i] === "อายุ" || cols[i] === "พรรษา" || cols[i] === "เขต" || cols[i] === "สังกัดวัด" ? "text-center" : "")}>
                      {d(v)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-8 break-inside-avoid text-center leading-loose" data-testid="pass-certify">
        {form?.certify_text ? <p>{d(form.certify_text)}</p> : null}
        {(form?.signatures ?? []).map((s, i) => (
          <div key={i} className="mt-6">
            <p>..................................................</p>
            {s.text.split("\n").map((line, j) => (
              <p key={j}>{d(line)}</p>
            ))}
          </div>
        ))}
        {announcedOn ? <p className="mt-1">วันที่ {d(thaiDate(announcedOn))}</p> : null}
      </div>
      <p className="mt-6 text-right text-sm">
        {d(section.heading)}  {d(section.title.replace(/^บัญชีรายชื่อผู้สอบประโยค /, "").replace(/ ได้$/, ""))} ({d(code)})
      </p>
    </div>
  );
}
