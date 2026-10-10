import Link from "next/link";
import { Fragment } from "react";

import { reportCell, type ReportTable } from "@/lib/reports";
import { cn } from "@/lib/utils";

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** ตารางรายงานบนจอ (ข้อมูลชุดเดียวกับไฟล์ Excel และหน้าพิมพ์) ถ้ารายงานกำหนด groupColumn จะแสดงเป็นหัวกลุ่ม */
export function ReportView({ report }: { report: ReportTable }) {
  const group = report.groupColumn;
  const shown = report.columns.map((c, j) => ({ ...c, j })).filter((c) => c.j !== group);
  const groupSize = (value: string | number) => report.rows.filter((r) => r[group ?? -1] === value).length;
  return (
    <div data-testid="report-view">
      <h2 className="text-xl font-bold text-primary">{report.title}</h2>
      <p className="text-muted-foreground">{report.subtitle}</p>
      {report.note ? <p className="mt-1 text-sm text-muted-foreground">{report.note}</p> : null}
      <div className="relative mt-3 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[40rem] border-collapse">
          <thead className="bg-muted">
            <tr>
              {shown.map((c) => (
                <th key={c.header} scope="col" className={cn("border-b px-3 py-2 font-semibold", alignClass[c.align ?? "left"])}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={shown.length} className="px-3 py-8 text-center text-muted-foreground">
                  ไม่มีข้อมูลในเขตนี้
                </td>
              </tr>
            ) : (
              report.rows.map((row, i) => (
                <Fragment key={i}>
                  {group !== undefined && (i === 0 || report.rows[i - 1][group] !== row[group]) ? (
                    <tr className="border-b bg-secondary" data-testid="report-group">
                      <th scope="colgroup" colSpan={shown.length} className="px-3 py-2 text-left font-bold text-primary">
                        {report.columns[group].header}
                        {row[group]}{" "}
                        <span className="font-normal text-muted-foreground">
                          ({groupSize(row[group]).toLocaleString("th-TH")} รายการ)
                        </span>
                      </th>
                    </tr>
                  ) : null}
                  <tr className="border-b align-top last:border-b-0">
                    {shown.map((c, k) => (
                      <td key={c.j} className={cn("px-3 py-2", alignClass[c.align ?? "left"], c.format ? "tabular-nums" : "")}>
                        {k === 0 && report.rowLinks?.[i] ? (
                          <Link href={report.rowLinks[i] as string} prefetch={false} className="text-primary underline underline-offset-4">
                            {reportCell(c, row[c.j])}
                          </Link>
                        ) : (
                          reportCell(c, row[c.j])
                        )}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
          {report.footer && report.rows.length > 0 ? (
            <tfoot className="bg-muted font-semibold">
              <tr>
                {shown.map((c) => (
                  <td key={c.j} className={cn("border-t px-3 py-2", alignClass[c.align ?? "left"])}>
                    {reportCell(c, report.footer?.[c.j])}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">ทั้งหมด {report.rows.length.toLocaleString("th-TH")} แถว</p>
    </div>
  );
}
