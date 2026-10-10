/**
 * บัญชีรายชื่อตามแบบ ศ. ของหนึ่งสนามสอบ: หัวแฟ้ม (แถว 3-5 ของแบบ) ตาราง 2 บรรทัดหัว และช่องลงนาม
 * ใช้ทั้งหน้าจอ (Server Component) และหน้าพิมพ์ (ภายใน PrintPage) จึงไม่มี hook: ส่งตัวแปลงเลข d เข้ามา
 */

import { cellText, columnHeadRows, headerFieldValue, headerLines, type ListForm, type VenueSection } from "@/lib/exam-lists";
import { cn } from "@/lib/utils";

type Digits = (v: string | number) => string;
const plain: Digits = (v) => String(v);

export function VenueHeader({ form, section, year, d = plain }: { form: ListForm; section: VenueSection; year: number; d?: Digits }) {
  return (
    <div className="text-center" data-testid="list-header">
      <p className="text-lg font-bold">{d(form.title.replace(/\s+/g, " "))}</p>
      {headerLines(form.header_cells).map((line, i) => (
        <p key={i} className="mt-1 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
          {line.map((c) =>
            c.field ? (
              <span key={c.cell} className="min-w-16 border-b border-dotted border-current px-2 font-semibold" data-field={c.field}>
                {d(headerFieldValue(c, section, year)) || " "}
              </span>
            ) : (
              <span key={c.cell}>{d(c.text ?? "")}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export function VenueTable({
  form,
  section,
  d = plain,
  dense = false,
}: {
  form: ListForm;
  section: VenueSection;
  d?: Digits;
  dense?: boolean;
}) {
  const [top, bottom] = columnHeadRows(form.columns);
  const totalWidth = form.columns.reduce((s, c) => s + (c.width || 10), 0);
  const cell = cn("border border-black align-middle", dense ? "px-1 py-0.5" : "px-2 py-1");
  return (
    <table className={cn("mt-2 w-full border-collapse", dense ? "text-[10.5px] leading-tight" : "min-w-[80rem] text-sm")} data-testid="list-table">
      <colgroup>
        {form.columns.map((c) => (
          <col key={c.key} style={{ width: `${(((c.width || 10) / totalWidth) * 100).toFixed(2)}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {top.map((h) => (
            <th key={h.key} colSpan={h.colSpan} rowSpan={h.rowSpan} scope="col" className={cn(cell, "text-center font-bold")}>
              {d(h.text)}
            </th>
          ))}
        </tr>
        <tr>
          {bottom.map((h) => (
            <th key={h.key} scope="col" className={cn(cell, "text-center font-semibold")}>
              {d(h.text)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {section.rows.map((r, i) => (
          <tr key={r.candidate_id} data-testid="list-row">
            {form.columns.map((c) => (
              <td key={c.key} className={cn(cell, c.key === "seq" || c.type === "date" || c.type === "year" ? "text-center" : "")}>
                {d(cellText(c, r, i + 1))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** ช่องลงนามท้ายบัญชี: เส้นลงชื่อ + ข้อความที่ผู้ดูแลระบบตั้ง (ไม่มีการเดาชื่อตำแหน่ง) */
export function SignatureBlock({ form, d = plain }: { form: ListForm; d?: Digits }) {
  if (form.signatures.length === 0) return null;
  return (
    <div
      className={cn("mt-8 grid gap-x-8 gap-y-8 break-inside-avoid", form.signatures.length === 1 ? "grid-cols-1 justify-items-end" : "grid-cols-2")}
      data-testid="signature-block"
    >
      {form.signatures.map((s, i) => (
        <div key={i} className="min-w-[60mm] text-center">
          <p className="whitespace-nowrap">ลงชื่อ ..................................................</p>
          {s.text.split("\n").map((line, j) => (
            <p key={j} className="mt-1">
              {d(line)}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
