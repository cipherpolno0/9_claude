"use client";

import { D, PrintPage, useDigits } from "@/components/print/print-page";

type Row = { id: string; code: string; name: string; level: string; sect: string };

function Table({ rows }: { rows: Row[] }) {
  const d = useDigits();
  return (
    <table className="mt-3 w-full border-collapse text-left">
      <thead>
        <tr>
          {["ที่", "รหัสหน่วย", "ชื่อหน่วย", "ระดับ", "นิกาย"].map((h) => (
            <th key={h} className="border border-black px-2 py-1 font-bold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td className="border border-black px-2 py-1 text-center">{d(i + 1)}</td>
            <td className="border border-black px-2 py-1">{r.code}</td>
            <td className="border border-black px-2 py-1">{d(r.name)}</td>
            <td className="border border-black px-2 py-1">{r.level}</td>
            <td className="border border-black px-2 py-1">{r.sect}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** ตัวอย่างการใช้หน้าพิมพ์กลาง */
export function DemoPrintSheet({ rows, printedOn }: { rows: Row[]; printedOn: string }) {
  return (
    <PrintPage title="บัญชีรายชื่อเขตปกครอง (ตัวอย่างหน้าพิมพ์)" subtitle={`ข้อมูล ณ วันที่ ${printedOn}`}>
      <p>
        เอกสารนี้เป็นตัวอย่างของหน้าพิมพ์กลาง มีรายการทั้งหมด <D>{rows.length}</D> หน่วย
      </p>
      <Table rows={rows} />
      <p className="mt-10 text-right">ลงชื่อ ........................................................</p>
      <p className="text-right">(........................................................)</p>
    </PrintPage>
  );
}
