"use client";

import { D, PrintPage, useDigits } from "@/components/print/print-page";
import { reportCell, type ReportTable } from "@/lib/reports";
import { cn } from "@/lib/utils";

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

function Table({
  report,
  rows,
  footer,
}: {
  report: ReportTable;
  rows: (string | number)[][];
  footer?: (string | number)[];
}) {
  const d = useDigits();
  const cell = "border border-black px-2 py-1 align-top";
  const shown = report.columns.map((c, j) => ({ ...c, j })).filter((c) => c.j !== report.groupColumn);
  return (
    <table className="mt-3 w-full border-collapse text-[0.95rem]">
      <thead>
        <tr>
          <th className={cn(cell, "text-center font-bold")}>ที่</th>
          {shown.map((c) => (
            <th key={c.header} className={cn(cell, "font-bold", alignClass[c.align ?? "left"])}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className={cn(cell, "text-center")}>{d(i + 1)}</td>
            {shown.map((c) => (
              <td key={c.j} className={cn(cell, alignClass[c.align ?? "left"])}>
                {d(reportCell(c, row[c.j]) ?? "")}
              </td>
            ))}
          </tr>
        ))}
        {footer && rows.length > 0 ? (
          <tr>
            <td className={cell} />
            {shown.map((c) => (
              <td key={c.j} className={cn(cell, "font-bold", alignClass[c.align ?? "left"])}>
                {d(reportCell(c, footer[c.j]) ?? "")}
              </td>
            ))}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** แบ่งแถวเป็นกลุ่มตามคอลัมน์ groupColumn (แถวเรียงตามคอลัมน์นี้มาแล้ว) */
function groupsOf(report: ReportTable): { title: string; rows: (string | number)[][] }[] {
  const g = report.groupColumn;
  if (g === undefined) return [];
  const groups: { title: string; rows: (string | number)[][] }[] = [];
  for (const row of report.rows) {
    const title = `${report.columns[g].header}${row[g]}`;
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.rows.push(row);
    else groups.push({ title, rows: [row] });
  }
  return groups;
}

/** หน้าพิมพ์ของรายงาน (ใช้หน้าพิมพ์กลาง เลือกเลขไทยหรือเลขอารบิกได้) รายงานที่มี groupColumn พิมพ์แยกตารางตามกลุ่ม */
export function ReportPrintSheet({
  report,
  emptyText = "ไม่มีข้อมูลในเขตนี้",
  orientation = "portrait",
}: {
  report: ReportTable;
  emptyText?: string;
  orientation?: "portrait" | "landscape";
}) {
  const groups = groupsOf(report);
  return (
    <PrintPage title={report.title} subtitle={report.subtitle} orientation={orientation}>
      {report.note ? <p className="text-sm">{report.note}</p> : null}
      {report.rows.length === 0 ? (
        <p className="mt-3">{emptyText}</p>
      ) : (
        <>
          {groups.length > 0 ? (
            groups.map((g) => (
              <section key={g.title} className="mt-4">
                <h2 className="font-bold">
                  <D>{g.title}</D> (<D>{g.rows.length}</D> รายการ)
                </h2>
                <Table report={report} rows={g.rows} />
              </section>
            ))
          ) : (
            <Table report={report} rows={report.rows} footer={report.footer} />
          )}
          <p className="mt-3">
            รวมทั้งสิ้น <D>{report.rows.length}</D> รายการ
          </p>
        </>
      )}
    </PrintPage>
  );
}
