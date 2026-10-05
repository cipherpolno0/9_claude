"use client";

import { D, PrintPage, useDigits } from "@/components/print/print-page";

export type RequestPrintData = {
  title: string;
  subtitle: string;
  facts: [string, string][];
  counts: { label: string; teachers: number; students: number }[] | null;
  blocks: [string, string][];
  documents: { name: string; required: boolean; fileCount: number }[];
  otherFileCount: number;
  steps: { stepNo: number; unit: string; result: string; comment: string; decider: string; date: string }[];
  statusLine: string;
  printedAt: string;
};

function Body({ data }: { data: RequestPrintData }) {
  const d = useDigits();
  const cell = "border border-black px-2 py-1 align-top";
  return (
    <>
      <table className="w-full border-collapse" data-testid="print-facts">
        <tbody>
          {data.facts.map(([label, value]) => (
            <tr key={label}>
              <th scope="row" className="w-[11rem] py-1 pr-3 text-left align-top font-bold">{label}</th>
              <td className="py-1">{d(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.counts ? (
        <>
          <h2 className="mt-4 font-bold">จำนวนครูและนักเรียน แยกตามแผนก</h2>
          <table className="mt-1 w-full border-collapse" data-testid="print-counts">
            <thead>
              <tr>
                <th className={`${cell} text-left font-bold`}>แผนก</th>
                <th className={`${cell} text-right font-bold`}>ครู (รูป/คน)</th>
                <th className={`${cell} text-right font-bold`}>นักเรียน (รูป/คน)</th>
              </tr>
            </thead>
            <tbody>
              {data.counts.map((c) => (
                <tr key={c.label}>
                  <td className={cell}>{c.label}</td>
                  <td className={`${cell} text-right`}>{d(c.teachers.toLocaleString("en-US"))}</td>
                  <td className={`${cell} text-right`}>{d(c.students.toLocaleString("en-US"))}</td>
                </tr>
              ))}
              <tr>
                <td className={`${cell} font-bold`}>รวม</td>
                <td className={`${cell} text-right font-bold`}>
                  {d(data.counts.reduce((sum, c) => sum + c.teachers, 0).toLocaleString("en-US"))}
                </td>
                <td className={`${cell} text-right font-bold`}>
                  {d(data.counts.reduce((sum, c) => sum + c.students, 0).toLocaleString("en-US"))}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      ) : null}

      {data.blocks.map(([label, value]) => (
        <div key={label} className="mt-4">
          <h2 className="font-bold">{label}</h2>
          <p className="whitespace-pre-wrap">{d(value || "-")}</p>
        </div>
      ))}

      <h2 className="mt-4 font-bold">เอกสารแนบ</h2>
      {data.documents.length === 0 && data.otherFileCount === 0 ? (
        <p>-</p>
      ) : (
        <ol className="list-none" data-testid="print-documents">
          {data.documents.map((doc, i) => (
            <li key={doc.name}>
              {d(i + 1)}. {d(doc.name)} — {doc.fileCount > 0 ? <>แนบแล้ว <D>{doc.fileCount}</D> ไฟล์</> : doc.required ? "ยังไม่ได้แนบ" : "ไม่ได้แนบ"}
            </li>
          ))}
          {data.otherFileCount > 0 ? (
            <li>
              เอกสารอื่น — <D>{data.otherFileCount}</D> ไฟล์
            </li>
          ) : null}
        </ol>
      )}

      <h2 className="mt-4 font-bold">การพิจารณาตามลำดับชั้น</h2>
      <p>{d(data.statusLine)}</p>
      <table className="mt-1 w-full border-collapse text-[0.95rem]" data-testid="print-steps">
        <thead>
          <tr>
            <th className={`${cell} w-10 text-center font-bold`}>ขั้น</th>
            <th className={`${cell} text-left font-bold`}>ชั้นที่พิจารณา</th>
            <th className={`${cell} text-left font-bold`}>ผล</th>
            <th className={`${cell} text-left font-bold`}>ความเห็น</th>
            <th className={`${cell} text-left font-bold`}>ผู้พิจารณา / วันที่</th>
          </tr>
        </thead>
        <tbody>
          {data.steps.map((s) => (
            <tr key={s.stepNo} className="break-inside-avoid">
              <td className={`${cell} text-center`}>{d(s.stepNo)}</td>
              <td className={cell}>{d(s.unit)}</td>
              <td className={cell}>{s.result}</td>
              <td className={`${cell} whitespace-pre-wrap`}>{d(s.comment)}</td>
              <td className={cell}>
                {s.decider}
                {s.date ? <span className="block">{d(s.date)}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-6 text-sm">พิมพ์จากระบบเมื่อ {d(data.printedAt)}</p>
    </>
  );
}

/** แบบพิมพ์คำขอจัดตั้งหรือขอยุบสำนัก บนหน้าพิมพ์กลาง */
export function RequestPrintSheet({ data }: { data: RequestPrintData }) {
  return (
    <PrintPage title={data.title} subtitle={data.subtitle}>
      <Body data={data} />
    </PrintPage>
  );
}
