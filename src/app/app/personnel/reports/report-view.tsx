import type { ReportTable } from "@/lib/reports";
import { cn } from "@/lib/utils";

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** ตารางรายงานบนจอ (ข้อมูลชุดเดียวกับไฟล์ Excel และหน้าพิมพ์) */
export function ReportView({ report }: { report: ReportTable }) {
  return (
    <div data-testid="report-view">
      <h2 className="text-xl font-bold text-primary">{report.title}</h2>
      <p className="text-muted-foreground">{report.subtitle}</p>
      {report.note ? <p className="mt-1 text-sm text-muted-foreground">{report.note}</p> : null}
      <div className="mt-3 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[40rem] border-collapse">
          <thead className="bg-muted">
            <tr>
              {report.columns.map((c) => (
                <th key={c.header} scope="col" className={cn("border-b px-3 py-2 font-semibold", alignClass[c.align ?? "left"])}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={report.columns.length} className="px-3 py-8 text-center text-muted-foreground">
                  ไม่มีข้อมูลในเขตนี้
                </td>
              </tr>
            ) : (
              report.rows.map((row, i) => (
                <tr key={i} className="border-b align-top last:border-b-0">
                  {row.map((cell, j) => (
                    <td key={j} className={cn("px-3 py-2", alignClass[report.columns[j]?.align ?? "left"])}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {report.footer && report.rows.length > 0 ? (
            <tfoot className="bg-muted font-semibold">
              <tr>
                {report.footer.map((cell, j) => (
                  <td key={j} className={cn("border-t px-3 py-2", alignClass[report.columns[j]?.align ?? "left"])}>
                    {cell}
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
