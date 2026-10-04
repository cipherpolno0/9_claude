"use client";

import { D, PrintPage, useDigits } from "@/components/print/print-page";
import type { ReportTable } from "@/lib/reports";
import { cn } from "@/lib/utils";

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

function Table({ report }: { report: ReportTable }) {
  const d = useDigits();
  const cell = "border border-black px-2 py-1 align-top";
  return (
    <table className="mt-3 w-full border-collapse text-[0.95rem]">
      <thead>
        <tr>
          <th className={cn(cell, "text-center font-bold")}>ที่</th>
          {report.columns.map((c) => (
            <th key={c.header} className={cn(cell, "font-bold", alignClass[c.align ?? "left"])}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.rows.map((row, i) => (
          <tr key={i}>
            <td className={cn(cell, "text-center")}>{d(i + 1)}</td>
            {row.map((value, j) => (
              <td key={j} className={cn(cell, alignClass[report.columns[j]?.align ?? "left"])}>
                {d(value)}
              </td>
            ))}
          </tr>
        ))}
        {report.footer && report.rows.length > 0 ? (
          <tr>
            <td className={cell} />
            {report.footer.map((value, j) => (
              <td key={j} className={cn(cell, "font-bold", alignClass[report.columns[j]?.align ?? "left"])}>
                {d(value)}
              </td>
            ))}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** หน้าพิมพ์ของรายงานบุคลากร (ใช้หน้าพิมพ์กลาง เลือกเลขไทยหรือเลขอารบิกได้) */
export function ReportPrintSheet({ report }: { report: ReportTable }) {
  return (
    <PrintPage title={report.title} subtitle={report.subtitle}>
      {report.note ? <p className="text-sm">{report.note}</p> : null}
      {report.rows.length === 0 ? (
        <p className="mt-3">ไม่มีข้อมูลในเขตนี้</p>
      ) : (
        <>
          <Table report={report} />
          <p className="mt-3">
            รวมทั้งสิ้น <D>{report.rows.length}</D> รายการ
          </p>
        </>
      )}
    </PrintPage>
  );
}
